import { Effect, Layer, Option } from "effect"
import { SqlClient } from "@effect/sql"

import { PersistenceError } from "../../../shared/errors.js"
import type { Film } from "../domain/film.js"
import { Film as FilmValue, makeFilmId } from "../domain/film.js"
import { FilmRepository } from "../domain/repository.js"
import { seedFilms } from "./groupBuyInMemory.js"

/** 把底层 SQL 错误映射为领域层的 PersistenceError，不向领域泄漏具体错误类型 */
const query = <A, E>(self: Effect.Effect<A, E>): Effect.Effect<A, PersistenceError> =>
  self.pipe(
    Effect.mapError((e) =>
      new PersistenceError({ message: e instanceof Error ? e.message : String(e) }),
    ),
  )

const FILM_COLUMNS = `id, name, brand, format, iso, process, cover_image_url, description, features, scenarios, sample_images, base_price_in_cents, threshold, group_buy_price_in_cents`

/**
 * FilmRepository SQL 实现（Effect SQL + PostgreSQL）。
 * 表结构见 migrations/0003_groupbuy_films.sql。
 * 首次启动（空表）时写入内存仓储同款种子数据；管理员编辑通过 save 持久化。
 */
export const FilmRepositorySql = Layer.effect(
  FilmRepository,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const toFilm = (row: {
      id: string
      name: string
      brand: string
      format: string
      iso: number
      process: string
      cover_image_url: string
      description: string
      features: ReadonlyArray<string> | null
      scenarios: ReadonlyArray<string> | null
      sample_images: ReadonlyArray<Film["sampleImages"][number]> | null
      base_price_in_cents: number
      threshold: number
      group_buy_price_in_cents: number
    }): FilmValue =>
      new FilmValue({
        id: makeFilmId(row.id),
        name: row.name,
        brand: row.brand,
        format: row.format === "120" ? "120" : "135",
        iso: row.iso,
        process: row.process,
        coverImageUrl: row.cover_image_url ?? "",
        description: row.description ?? "",
        features: row.features ?? [],
        scenarios: row.scenarios ?? [],
        sampleImages: row.sample_images ?? [],
        basePriceInCents: row.base_price_in_cents,
        deal: {
          threshold: row.threshold,
          groupBuyPriceInCents: row.group_buy_price_in_cents,
        },
      })

    const findAll = query(
      sql`SELECT ${FILM_COLUMNS} FROM groupbuy_films`,
    ).pipe(
      Effect.map((rows) =>
        (rows as unknown as ReadonlyArray<Parameters<typeof toFilm>[0]>).map(toFilm),
      ),
    )

    const repo = FilmRepository.make({
      findAll: () => findAll,

      findById: (id): Effect.Effect<Option.Option<Film>, PersistenceError> =>
        query(
          sql`SELECT ${FILM_COLUMNS} FROM groupbuy_films WHERE id = ${id}`,
        ).pipe(
          Effect.map((rows) => {
            const row = (rows as unknown as ReadonlyArray<Parameters<typeof toFilm>[0]>)[0]
            return row ? Option.some(toFilm(row)) : Option.none()
          }),
        ),

      save: (film): Effect.Effect<void, PersistenceError> =>
        query(
          sql`INSERT INTO groupbuy_films (id, name, brand, format, iso, process, cover_image_url, description, features, scenarios, sample_images, base_price_in_cents, threshold, group_buy_price_in_cents)
              VALUES (${film.id}, ${film.name}, ${film.brand}, ${film.format}, ${film.iso}, ${film.process}, ${film.coverImageUrl}, ${film.description}, ${film.features}, ${film.scenarios}, ${film.sampleImages}, ${film.basePriceInCents}, ${film.deal.threshold}, ${film.deal.groupBuyPriceInCents})
              ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                brand = EXCLUDED.brand,
                format = EXCLUDED.format,
                iso = EXCLUDED.iso,
                process = EXCLUDED.process,
                cover_image_url = EXCLUDED.cover_image_url,
                description = EXCLUDED.description,
                features = EXCLUDED.features,
                scenarios = EXCLUDED.scenarios,
                sample_images = EXCLUDED.sample_images,
                base_price_in_cents = EXCLUDED.base_price_in_cents,
                threshold = EXCLUDED.threshold,
                group_buy_price_in_cents = EXCLUDED.group_buy_price_in_cents`,
        ).pipe(Effect.asVoid),
    })

    // 首次启动（空表）：写入种子数据，保证 SQL 模式与内存模式商品目录一致
    yield* query(sql`SELECT COUNT(*)::int AS count FROM groupbuy_films`).pipe(
      Effect.map((rows) => (rows as unknown as ReadonlyArray<{ count: number }>)[0]?.count ?? 0),
      Effect.flatMap((count) =>
        count === 0
          ? Effect.forEach(seedFilms(), (film) => repo.save(film), { discard: true })
          : Effect.void,
      ),
    )

    return repo
  }),
)
