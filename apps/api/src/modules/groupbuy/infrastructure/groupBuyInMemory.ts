import { Effect, Layer, Option, Ref } from "effect"

import { PersistenceError } from "../../../shared/errors.js"
import type { SampleImage , FilmId} from "../domain/film.js"
import { Film, makeFilmId } from "../domain/film.js"
import type { GroupBuy } from "../domain/groupBuy.js"
import type { HubId } from "../domain/hub.js"
import { Hub, makeHubId } from "../domain/hub.js"
import { FilmRepository, GroupBuyRepository, HubRepository } from "../domain/repository.js"

/**
 * groupbuy 上下文内存仓储（含 mock 种子数据）。
 * 成团优惠条件（threshold / 成团价）为与商家谈判结果的 mock 占位。
 * 商品封面为真实胶卷商品图（Wikimedia Commons 自由授权图，下载到 assets/films/*.jpg）；
 * 仅 Fujifilm PRO 400H（120）暂缺可靠商品图，仍用占位插画，后续替换。
 */

const demoImage = (i: number): SampleImage => ({
  id: `seed-demo-${i}`,
  url: `/api/groupbuy/images/demo/demo-${i}.svg`,
  uploadedBy: "seed",
})

const cover = (name: string): string => `/api/groupbuy/images/films/${name}`

const seedHubs = (now: Date): ReadonlyArray<Hub> => [
  Hub.create({
    id: makeHubId("hub-sh-ja"),
    name: "上海·静安寺点",
    city: "上海",
    address: "静安区胶州路 158 号 · 光影空间",
    createdAt: now,
  }),
  Hub.create({
    id: makeHubId("hub-sh-wjc"),
    name: "上海·五角场点",
    city: "上海",
    address: "杨浦区大学路 65 号 · 白噪咖啡",
    createdAt: now,
  }),
  Hub.create({
    id: makeHubId("hub-hz-bj"),
    name: "杭州·滨江点",
    city: "杭州",
    address: "滨江区江陵路 1916 号 · 星澜里",
    createdAt: now,
  }),
  Hub.create({
    id: makeHubId("hub-bj-wdk"),
    name: "北京·五道口点",
    city: "北京",
    address: "海淀区成府路 45 号 · 胶集",
    createdAt: now,
  }),
]

const seedFilms = (): ReadonlyArray<Film> => [
  // ===== 135 画幅 =====
  Film.create({
    id: makeFilmId("film-kodak-gold-200-135"),
    name: "Kodak Gold 200",
    brand: "Kodak",
    format: "135",
    iso: 200,
    process: "C-41",
    coverImageUrl: cover("kodak-gold-200-135.jpg"),
    features: ["经典暖色调，肤色讨喜", "宽容度高，容错友好", "颗粒细腻", "入门性价比之王"],
    scenarios: ["日常扫街", "人像", "旅行记录"],
    sampleImages: [demoImage(1), demoImage(2), demoImage(3)],
    basePriceInCents: 5980,
    deal: { threshold: 20, groupBuyPriceInCents: 4590 },
  }),
  Film.create({
    id: makeFilmId("film-kodak-portra-400-135"),
    name: "Kodak Portra 400",
    brand: "Kodak",
    format: "135",
    iso: 400,
    process: "C-41",
    coverImageUrl: cover("kodak-portra-400-135.jpg"),
    features: ["肤色还原自然", "颗粒极其细腻", "高感光度下依然稳定"],
    scenarios: ["人像", "婚礼", "弱光环境"],
    sampleImages: [demoImage(1), demoImage(2)],
    basePriceInCents: 9580,
    deal: { threshold: 30, groupBuyPriceInCents: 7990 },
  }),
  Film.create({
    id: makeFilmId("film-kodak-ektar-100-135"),
    name: "Kodak Ektar 100",
    brand: "Kodak",
    format: "135",
    iso: 100,
    process: "C-41",
    coverImageUrl: cover("kodak-ektar-100-135.jpg"),
    features: ["色彩饱和浓郁", "颗粒极细", "锐度高"],
    scenarios: ["风光", "建筑", "晴天人像"],
    sampleImages: [demoImage(1), demoImage(3)],
    basePriceInCents: 6980,
    deal: { threshold: 30, groupBuyPriceInCents: 5990 },
  }),
  Film.create({
    id: makeFilmId("film-fujifilm-c200-135"),
    name: "Fujifilm C200",
    brand: "Fujifilm",
    format: "135",
    iso: 200,
    process: "C-41",
    coverImageUrl: cover("fujifilm-c200-135.jpg"),
    features: ["日系清淡色彩", "绿色表现清新", "价格亲民"],
    scenarios: ["日常记录", "风景", "美食"],
    sampleImages: [demoImage(2), demoImage(3)],
    basePriceInCents: 4380,
    deal: { threshold: 25, groupBuyPriceInCents: 3590 },
  }),
  Film.create({
    id: makeFilmId("film-ilford-hp5-135"),
    name: "Ilford HP5 Plus",
    brand: "Ilford",
    format: "135",
    iso: 400,
    process: "黑白 (D-76)",
    coverImageUrl: cover("ilford-hp5-135.jpg"),
    features: ["灰阶过渡丰富", "高宽容度", "迫冲潜力大"],
    scenarios: ["纪实", "街头摄影", "阴天弱光"],
    sampleImages: [demoImage(3), demoImage(1)],
    basePriceInCents: 5580,
    deal: { threshold: 20, groupBuyPriceInCents: 4680 },
  }),
  // ===== 120 画幅（中画幅） =====
  Film.create({
    id: makeFilmId("film-kodak-gold-200-120"),
    name: "Kodak Gold 200",
    brand: "Kodak",
    format: "120",
    iso: 200,
    process: "C-41",
    coverImageUrl: cover("kodak-gold-200-120.jpg"),
    features: ["中画幅大底片", "暖调经典，细节丰富", "宽容度高"],
    scenarios: ["中画幅扫街", "风光", "胶片入门升级"],
    sampleImages: [demoImage(1), demoImage(2)],
    basePriceInCents: 7480,
    deal: { threshold: 15, groupBuyPriceInCents: 6290 },
  }),
  Film.create({
    id: makeFilmId("film-kodak-portra-400-120"),
    name: "Kodak Portra 400",
    brand: "Kodak",
    format: "120",
    iso: 400,
    process: "C-41",
    coverImageUrl: cover("kodak-portra-400-120.jpg"),
    features: ["6×6/6×7 细腻画质", "肤色自然", "弱光稳定"],
    scenarios: ["中画幅人像", "婚礼跟拍", "棚拍"],
    sampleImages: [demoImage(2), demoImage(3)],
    basePriceInCents: 11580,
    deal: { threshold: 15, groupBuyPriceInCents: 9890 },
  }),
  Film.create({
    id: makeFilmId("film-fujifilm-pro400h-120"),
    name: "Fujifilm PRO 400H",
    brand: "Fujifilm",
    format: "120",
    iso: 400,
    process: "C-41",
    coverImageUrl: cover("fujifilm-pro400h-120.svg"),
    features: ["日系清新色调", "高光过渡柔和", "绿色表现通透"],
    scenarios: ["日系人像", "旅行", "生活记录"],
    sampleImages: [demoImage(2), demoImage(1)],
    basePriceInCents: 10880,
    deal: { threshold: 15, groupBuyPriceInCents: 9280 },
  }),
  Film.create({
    id: makeFilmId("film-ilford-hp5-120"),
    name: "Ilford HP5 Plus",
    brand: "Ilford",
    format: "120",
    iso: 400,
    process: "黑白 (D-76)",
    coverImageUrl: cover("ilford-hp5-120.jpg"),
    features: ["中画幅灰阶细腻", "高宽容度", "迫冲潜力大"],
    scenarios: ["中画幅纪实", "街头", "阴天弱光"],
    sampleImages: [demoImage(3), demoImage(2)],
    basePriceInCents: 6480,
    deal: { threshold: 15, groupBuyPriceInCents: 5490 },
  }),
]

const persistence = <A, E>(self: Effect.Effect<A, E>): Effect.Effect<A, PersistenceError> =>
  self.pipe(
    Effect.mapError((e) =>
      new PersistenceError({ message: e instanceof Error ? e.message : String(e) }),
    ),
  )

export const HubRepositoryInMemory = Layer.effect(
  HubRepository,
  Effect.gen(function* () {
    const store = yield* Ref.make(new Map<string, Hub>(seedHubs(new Date()).map((h) => [h.id, h])))
    return HubRepository.make({
      findAll: () => persistence(Ref.get(store).pipe(Effect.map((m) => [...m.values()]))),
      findById: (id: HubId) =>
        persistence(Ref.get(store).pipe(Effect.map((m) => Option.fromNullable(m.get(id))))),
      save: (hub: Hub) => persistence(Ref.update(store, (m) => m.set(hub.id, hub))),
    })
  }),
)

export const FilmRepositoryInMemory = Layer.effect(
  FilmRepository,
  Effect.gen(function* () {
    const store = yield* Ref.make(new Map<string, Film>(seedFilms().map((f) => [f.id, f])))
    return FilmRepository.make({
      findAll: () => persistence(Ref.get(store).pipe(Effect.map((m) => [...m.values()]))),
      findById: (id: FilmId) =>
        persistence(Ref.get(store).pipe(Effect.map((m) => Option.fromNullable(m.get(id))))),
      save: (film: Film) => persistence(Ref.update(store, (m) => m.set(film.id, film))),
    })
  }),
)

export const GroupBuyRepositoryInMemory = Layer.effect(
  GroupBuyRepository,
  Effect.gen(function* () {
    const store = yield* Ref.make(new Map<string, GroupBuy>())
    const keyOf = (hubId: HubId, filmId: FilmId): string => `${hubId}::${filmId}`
    return GroupBuyRepository.make({
      findByHubAndFilm: (hubId: HubId, filmId: FilmId) =>
        persistence(
          Ref.get(store).pipe(Effect.map((m) => Option.fromNullable(m.get(keyOf(hubId, filmId))))),
        ),
      save: (group: GroupBuy) =>
        persistence(Ref.update(store, (m) => m.set(keyOf(group.hubId, group.filmId), group))),
    })
  }),
)
