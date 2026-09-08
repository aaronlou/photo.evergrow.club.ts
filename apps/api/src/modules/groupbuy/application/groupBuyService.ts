import { Clock, Effect, Option } from "effect"

import type { PersistenceError } from "../../../shared/errors.js"
import { IdGenerator } from "../../../shared/kernel.js"
import type { GroupBuySucceededEvent } from "../domain/events.js"
import type {
  FilmAlreadyExists} from "../domain/errors.js";
import {
  AlreadyJoinedGroup,
  AlreadyJoinedHub,
  FilmNotFound,
  HubClosed,
  HubInUse,
  HubNotFound,
  HubNotJoined,
  InvalidQuantity,
  NotJoinedGroup,
  SampleImageForbidden,
  SampleImageNotFound,
} from "../domain/errors.js"
import type { FilmId, SampleImage } from "../domain/film.js"
import { Film, makeFilmId } from "../domain/film.js"
import type { DeliveryMode, GroupBuyStatus } from "../domain/groupBuy.js"
import { GroupBuy } from "../domain/groupBuy.js"
import type { HubId } from "../domain/hub.js"
import { Hub, makeHubId } from "../domain/hub.js"
import type { ImageUploadInput } from "../domain/imageStorage.js"
import { ImageStorage } from "../domain/imageStorage.js"
import { FilmRepository, GroupBuyRepository, HubRepository } from "../domain/repository.js"

/** 拼团进度（用例层返回结构，DTO 映射在接口层） */
export interface GroupProgress {
  readonly hubId: HubId
  readonly filmId: FilmId
  /** 累计件数（成团判定依据） */
  readonly memberCount: number
  /** 参与人数 */
  readonly participantCount: number
  readonly threshold: number
  readonly status: GroupBuyStatus
  /** 还差多少件成团 */
  readonly remaining: number
  readonly joinedByMe: boolean
  /** 我的购买数量 */
  readonly myQuantity: number
  readonly unitPriceInCents: number
  readonly totalInCents: number
  /** 订金（总金额 × 10%） */
  readonly depositInCents: number
  readonly depositPaid: boolean
  readonly deliveryMode: DeliveryMode
}

export interface FilmWithProgress {
  readonly film: Film
  readonly progress: GroupProgress
}

/** 生成 URL/ID 友好的 slug：小写、非字母数字转连字符 */
const slug = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")

/**
 * GroupBuyService 用例层：胶卷团购的完整业务编排。
 * 流程：查看位置点 → 加入位置点 → 浏览商品 → 加入心愿单（参团，可指定数量）
 * → 等待成团；服务模式为货到付款，下单需支付总金额 10% 订金。
 */
export class GroupBuyService extends Effect.Service<GroupBuyService>()("GroupBuyService", {
  effect: Effect.gen(function* () {
    const hubs = yield* HubRepository
    const films = yield* FilmRepository
    const groups = yield* GroupBuyRepository
    const images = yield* ImageStorage
    const idgen = yield* IdGenerator

    const requireHub = (
      hubId: HubId,
    ): Effect.Effect<Hub, HubNotFound | PersistenceError> =>
      hubs.findById(hubId).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new HubNotFound({ hubId })),
            onSome: (hub) => Effect.succeed(hub),
          }),
        ),
      )

    const requireFilm = (
      filmId: FilmId,
    ): Effect.Effect<Film, FilmNotFound | PersistenceError> =>
      films.findById(filmId).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(new FilmNotFound({ filmId })),
            onSome: (film) => Effect.succeed(film),
          }),
        ),
      )

    /** 从聚合 + 商品构建进度（纯函数） */
    const progressOfGroup = (group: GroupBuy, film: Film, userId: string): GroupProgress => {
      const participant = group.participantOf(userId)
      const unitPriceInCents = film.deal.groupBuyPriceInCents
      return {
        hubId: group.hubId,
        filmId: film.id,
        memberCount: group.totalQuantity(),
        participantCount: group.participantCount(),
        threshold: film.deal.threshold,
        remaining: Math.max(0, film.deal.threshold - group.totalQuantity()),
        status: group.status,
        joinedByMe: group.hasJoined(userId),
        myQuantity: participant?.quantity ?? 0,
        unitPriceInCents,
        totalInCents: participant?.totalInCents ?? 0,
        depositInCents: participant?.depositInCents ?? 0,
        depositPaid: participant?.depositPaid ?? false,
        deliveryMode: "COD",
      }
    }

    /** 未成团时返回 0 件进度，不落库 */
    const progressOf = (hubId: HubId, film: Film, userId: string) =>
      groups.findByHubAndFilm(hubId, film.id).pipe(
        Effect.map((option) =>
          progressOfGroup(
            Option.getOrElse(option, () => GroupBuy.open({ hubId, filmId: film.id })),
            film,
            userId,
          ),
        ),
      )

    return {
      /** 1. 查看支持团购的位置点 */
      listHubs: (_userId: string): Effect.Effect<ReadonlyArray<Hub>, PersistenceError> =>
        hubs.findAll(),

      /** [管理端] 新增位置点：ID 由 city + name 生成 slug，冲突时追加随机后缀 */
      createHub: (input: {
        name: string
        city: string
        address: string
      }): Effect.Effect<Hub, PersistenceError> =>
        Effect.gen(function* () {
          const base = ["hub", slug(input.city), slug(input.name)].filter(Boolean).join("-")
          let id = makeHubId(base)
          const existing = yield* hubs.findById(id)
          if (Option.isSome(existing)) {
            id = makeHubId(`${base}-${(yield* idgen.nextUUID).slice(0, 8)}`)
          }
          const hub = Hub.create({
            id,
            name: input.name,
            city: input.city,
            address: input.address,
            createdAt: new Date(yield* Clock.currentTimeMillis),
          })
          yield* hubs.save(hub)
          return hub
        }),

      /** [管理端] 更新位置点信息（名称 / 城市 / 地址 / 状态，仅传的字段生效） */
      updateHub: (
        hubId: HubId,
        patch: {
          name?: string
          city?: string
          address?: string
          status?: "Active" | "Closed"
        },
      ): Effect.Effect<Hub, HubNotFound | PersistenceError> =>
        Effect.gen(function* () {
          const hub = yield* requireHub(hubId)
          const updated = hub
            .editInfo({ name: patch.name, city: patch.city, address: patch.address })
            .setStatus(patch.status ?? hub.status)
          yield* hubs.save(updated)
          return updated
        }),

      /**
       * [管理端] 删除位置点：该点下存在任何参团记录（有参与者）时拒绝删除，
       * 避免拼团中的用户丢失参团进度。
       */
      deleteHub: (
        hubId: HubId,
      ): Effect.Effect<void, HubNotFound | HubInUse | PersistenceError> =>
        Effect.gen(function* () {
          yield* requireHub(hubId)
          const allFilms = yield* films.findAll()
          const groupsOfHub = yield* Effect.forEach(allFilms, (film) =>
            groups.findByHubAndFilm(hubId, film.id),
          )
          const hasParticipants = groupsOfHub.some(
            (group) => Option.isSome(group) && group.value.participantCount() > 0,
          )
          if (hasParticipants) {
            return yield* Effect.fail(new HubInUse({ hubId }))
          }
          yield* hubs.delete(hubId)
        }),

      /** 2. 加入某个位置点 */
      joinHub: (
        userId: string,
        hubId: HubId,
      ): Effect.Effect<Hub, HubNotFound | HubClosed | AlreadyJoinedHub | PersistenceError> =>
        Effect.gen(function* () {
          const hub = yield* requireHub(hubId)
          if (hub.status === "Closed") {
            return yield* Effect.fail(new HubClosed({ hubId }))
          }
          if (hub.hasJoined(userId)) {
            return yield* Effect.fail(new AlreadyJoinedHub({ hubId }))
          }
          const updated = hub.join(userId)
          yield* hubs.save(updated)
          return updated
        }),

      /** 3. 商品列表（含该位置点下的拼团进度） */
      listFilms: (
        hubId: HubId,
        userId: string,
      ): Effect.Effect<ReadonlyArray<FilmWithProgress>, HubNotFound | PersistenceError> =>
        Effect.gen(function* () {
          yield* requireHub(hubId)
          const all = yield* films.findAll()
          return yield* Effect.forEach(
            all,
            (film) =>
              progressOf(hubId, film, userId).pipe(
                Effect.map((progress) => ({ film, progress })),
              ),
          )
        }),

      /** 3+. 商品详情（特性 / 适用场景 / 样片 + 拼团进度） */
      getFilm: (
        hubId: HubId,
        filmId: FilmId,
        userId: string,
      ): Effect.Effect<FilmWithProgress, HubNotFound | FilmNotFound | PersistenceError> =>
        Effect.gen(function* () {
          yield* requireHub(hubId)
          const film = yield* requireFilm(filmId)
          const progress = yield* progressOf(hubId, film, userId)
          return { film, progress }
        }),

      /** 4. 加入团购心愿单（参团，可指定数量） */
      joinGroupBuy: (
        hubId: HubId,
        filmId: FilmId,
        userId: string,
        quantity: number,
      ): Effect.Effect<
        GroupProgress,
        | HubNotFound
        | FilmNotFound
        | HubNotJoined
        | AlreadyJoinedGroup
        | InvalidQuantity
        | PersistenceError
      > =>
        Effect.gen(function* () {
          if (!Number.isInteger(quantity) || quantity < 1) {
            return yield* Effect.fail(new InvalidQuantity({ quantity }))
          }
          const hub = yield* requireHub(hubId)
          if (!hub.hasJoined(userId)) {
            return yield* Effect.fail(new HubNotJoined({ hubId }))
          }
          const film = yield* requireFilm(filmId)

          const existing = yield* groups.findByHubAndFilm(hubId, filmId)
          const group = Option.getOrElse(existing, () => GroupBuy.open({ hubId, filmId }))
          if (group.hasJoined(userId)) {
            return yield* Effect.fail(new AlreadyJoinedGroup({ hubId, filmId }))
          }

          const updated = group.join(userId, quantity, film.deal.groupBuyPriceInCents, film.deal.threshold)
          yield* groups.save(updated)

          // 成团：发布领域事件（当前仅日志，后续接事件总线驱动订单/通知）
          if (updated.status === "Succeeded" && group.status === "Open") {
            const event: GroupBuySucceededEvent = {
              _tag: "GroupBuySucceeded",
              hubId,
              filmId,
              memberCount: updated.totalQuantity(),
              occurredAt: new Date(yield* Clock.currentTimeMillis),
            }
            yield* Effect.logInfo(`【成团】${hubId} × ${filmId} 已达 ${event.memberCount} 件`)
          }

          return progressOfGroup(updated, film, userId)
        }),

      /** 4+. 支付订金（总金额的 10%，货到付款；无真实支付网关，模拟标记） */
      payDeposit: (
        hubId: HubId,
        filmId: FilmId,
        userId: string,
      ): Effect.Effect<GroupProgress, FilmNotFound | NotJoinedGroup | PersistenceError> =>
        Effect.gen(function* () {
          const film = yield* requireFilm(filmId)
          const existing = yield* groups.findByHubAndFilm(hubId, filmId)
          const group = Option.getOrElse(existing, () => GroupBuy.open({ hubId, filmId }))
          if (!group.hasJoined(userId)) {
            return yield* Effect.fail(new NotJoinedGroup({ hubId, filmId }))
          }

          const updated = group.markDepositPaid(userId)
          yield* groups.save(updated)
          yield* Effect.logInfo(
            `【支付订金】${hubId} × ${filmId} 用户 ${userId} 已支付订金 ¥${(progressOfGroup(updated, film, userId).depositInCents / 100).toFixed(2)}`,
          )
          return progressOfGroup(updated, film, userId)
        }),

      /** 5. 拼团进度（轮询"等待达到某个数量"） */
      getProgress: (
        hubId: HubId,
        filmId: FilmId,
        userId: string,
      ): Effect.Effect<GroupProgress, HubNotFound | FilmNotFound | PersistenceError> =>
        Effect.gen(function* () {
          yield* requireHub(hubId)
          const film = yield* requireFilm(filmId)
          return yield* progressOf(hubId, film, userId)
        }),

      /** 全局商品列表（不依赖位置点） */
      listAllFilms: (): Effect.Effect<ReadonlyArray<Film>, PersistenceError> =>
        films.findAll(),

      /** 全局商品详情（不依赖位置点） */
      getFilmById: (filmId: FilmId): Effect.Effect<Film, FilmNotFound | PersistenceError> =>
        requireFilm(filmId),

      /** 上传冲洗样片 */
      uploadSampleImage: (
        filmId: FilmId,
        userId: string,
        file: ImageUploadInput,
      ): Effect.Effect<SampleImage, FilmNotFound | PersistenceError> =>
        Effect.gen(function* () {
          const film = yield* requireFilm(filmId)
          const stored = yield* images.store(file)
          const image: SampleImage = {
            id: yield* idgen.nextUUID,
            url: stored.url,
            uploadedBy: userId,
          }
          yield* films.save(film.addSampleImage(image))
          return image
        }),

      /**
       * 删除冲洗样片：上传者本人或管理员。
       * 同时删除磁盘文件失败不阻断（孤儿文件可接受，数据一致优先）。
       */
      removeSampleImage: (
        filmId: FilmId,
        imageId: string,
        requesterId: string,
        isAdmin: boolean,
      ): Effect.Effect<
        Film,
        FilmNotFound | SampleImageNotFound | SampleImageForbidden | PersistenceError
      > =>
        Effect.gen(function* () {
          const film = yield* requireFilm(filmId)
          const image = film.sampleImages.find((img) => img.id === imageId)
          if (!image) {
            return yield* Effect.fail(new SampleImageNotFound({ filmId, imageId }))
          }
          if (!isAdmin && image.uploadedBy !== requesterId) {
            return yield* Effect.fail(new SampleImageForbidden({ filmId, imageId }))
          }
          const updated = film.removeSampleImage(imageId)
          yield* films.save(updated)
          const key = image.url.split("/").pop()
          if (key) {
            yield* images.remove(key).pipe(Effect.ignore)
          }
          return updated
        }),

      /** [管理端] 新增商品：ID 由 brand + name + format 生成 slug，冲突时追加随机后缀 */
      createFilm: (input: {
        name: string
        brand: string
        format: Film["format"]
        iso: number
        process: string
        coverImageUrl?: string
        description?: string
        features?: ReadonlyArray<string>
        scenarios?: ReadonlyArray<string>
        basePriceInCents: number
        threshold: number
        groupBuyPriceInCents: number
      }): Effect.Effect<Film, FilmAlreadyExists | PersistenceError> =>
        Effect.gen(function* () {
          const base = [
            "film",
            slug(input.brand),
            slug(input.name),
            slug(input.format),
          ]
            .filter(Boolean)
            .join("-")
          let id = makeFilmId(base)
          const existing = yield* films.findById(id)
          if (Option.isSome(existing)) {
            id = makeFilmId(`${base}-${(yield* idgen.nextUUID).slice(0, 8)}`)
          }
          const film = Film.create({
            id,
            name: input.name,
            brand: input.brand,
            format: input.format,
            iso: input.iso,
            process: input.process,
            coverImageUrl: input.coverImageUrl ?? "",
            description: input.description ?? "",
            features: input.features ?? [],
            scenarios: input.scenarios ?? [],
            sampleImages: [],
            basePriceInCents: input.basePriceInCents,
            deal: {
              threshold: input.threshold,
              groupBuyPriceInCents: input.groupBuyPriceInCents,
            },
          })
          yield* films.save(film)
          return film
        }),

      /** [管理端] 更新商品文案（描述 / 特性 / 适用场景） */
      updateFilm: (
        filmId: FilmId,
        patch: {
          description?: string
          features?: ReadonlyArray<string>
          scenarios?: ReadonlyArray<string>
        },
      ): Effect.Effect<Film, FilmNotFound | PersistenceError> =>
        Effect.gen(function* () {
          const film = yield* requireFilm(filmId)
          const updated = film.editInfo(patch)
          yield* films.save(updated)
          return updated
        }),

      /** [管理端] 更换商品封面图 */
      setFilmCover: (
        filmId: FilmId,
        file: ImageUploadInput,
      ): Effect.Effect<Film, FilmNotFound | PersistenceError> =>
        Effect.gen(function* () {
          const film = yield* requireFilm(filmId)
          const stored = yield* images.store(file)
          const updated = film.replaceCover(stored.url)
          yield* films.save(updated)
          return updated
        }),
    }
  }),
}) {}
