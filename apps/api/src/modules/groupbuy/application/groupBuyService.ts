import { Clock, Effect, Option } from "effect"

import type { PersistenceError } from "../../../shared/errors.js"
import { IdGenerator } from "../../../shared/kernel.js"
import type { GroupBuySucceededEvent } from "../domain/events.js"
import {
  AlreadyJoinedGroup,
  AlreadyJoinedHub,
  FilmNotFound,
  HubClosed,
  HubNotFound,
  HubNotJoined,
} from "../domain/errors.js"
import type { Film, FilmId, SampleImage } from "../domain/film.js"
import type { GroupBuyStatus } from "../domain/groupBuy.js";
import { GroupBuy } from "../domain/groupBuy.js"
import type { Hub, HubId } from "../domain/hub.js"
import type { ImageUploadInput } from "../domain/imageStorage.js";
import { ImageStorage } from "../domain/imageStorage.js"
import { FilmRepository, GroupBuyRepository, HubRepository } from "../domain/repository.js"

/** 拼团进度（用例层返回结构，DTO 映射在接口层） */
export interface GroupProgress {
  readonly hubId: HubId
  readonly filmId: FilmId
  readonly memberCount: number
  readonly threshold: number
  readonly status: GroupBuyStatus
  readonly joinedByMe: boolean
}

export interface FilmWithProgress {
  readonly film: Film
  readonly progress: GroupProgress
}

/**
 * GroupBuyService 用例层：胶卷团购的完整业务编排。
 * 流程：查看位置点 → 加入位置点 → 浏览商品 → 加入心愿单（参团）→ 等待成团。
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

    /** 未成团时返回 0 成员的进度，不落库 */
    const progressOf = (hubId: HubId, film: Film, userId: string) =>
      groups.findByHubAndFilm(hubId, film.id).pipe(
        Effect.map((option) => {
          const group = Option.getOrElse(option, () => GroupBuy.open({ hubId, filmId: film.id }))
          return {
            hubId,
            filmId: film.id,
            memberCount: group.memberCount(),
            threshold: film.deal.threshold,
            status: group.status,
            joinedByMe: group.hasJoined(userId),
          } satisfies GroupProgress
        }),
      )

    return {
      /** 1. 查看支持团购的位置点 */
      listHubs: (_userId: string): Effect.Effect<ReadonlyArray<Hub>, PersistenceError> =>
        hubs.findAll(),

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

      /** 4. 加入团购心愿单（参团） */
      joinGroupBuy: (
        hubId: HubId,
        filmId: FilmId,
        userId: string,
      ): Effect.Effect<
        GroupProgress,
        HubNotFound | FilmNotFound | HubNotJoined | AlreadyJoinedGroup | PersistenceError
      > =>
        Effect.gen(function* () {
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

          const updated = group.join(userId, film.deal.threshold)
          yield* groups.save(updated)

          // 成团：发布领域事件（当前仅日志，后续接事件总线驱动订单/通知）
          if (updated.status === "Succeeded" && group.status === "Open") {
            const event: GroupBuySucceededEvent = {
              _tag: "GroupBuySucceeded",
              hubId,
              filmId,
              memberCount: updated.memberCount(),
              occurredAt: new Date(yield* Clock.currentTimeMillis),
            }
            yield* Effect.logInfo(`【成团】${hubId} × ${filmId} 已达 ${event.memberCount} 人`)
          }

          return {
            hubId,
            filmId,
            memberCount: updated.memberCount(),
            threshold: film.deal.threshold,
            status: updated.status,
            joinedByMe: true,
          }
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
    }
  }),
}) {}
