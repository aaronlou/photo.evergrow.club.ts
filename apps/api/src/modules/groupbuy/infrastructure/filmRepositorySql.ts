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

/**
 * FilmRepository SQL 实现（Effect SQL + PostgreSQL）。
 * 表结构见 migrations/0003_groupbuy_films.sql。
 * 首次启动（空表）时写入内存仓储同款种子数据；管理员编辑通过 save 持久化。
 * 注意：列名必须写成 SQL 字面量——sql`` 模板中的 JS 插值会被当作参数占位符。
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

    const FILM_SELECT = `SELECT id, name, brand, format, iso, process, cover_image_url, description, features, scenarios, sample_images, base_price_in_cents, threshold, group_buy_price_in_cents FROM groupbuy_films`

    const findAll = query(sql.unsafe(FILM_SELECT)).pipe(
      Effect.map((rows) =>
        (rows as unknown as ReadonlyArray<Parameters<typeof toFilm>[0]>).map(toFilm),
      ),
    )

    const repo = FilmRepository.make({
      findAll: () => findAll,

      findById: (id): Effect.Effect<Option.Option<Film>, PersistenceError> =>
        query(sql`${sql.literal(FILM_SELECT)} WHERE id = ${id}`).pipe(
          Effect.map((rows) => {
            const row = (rows as unknown as ReadonlyArray<Parameters<typeof toFilm>[0]>)[0]
            return row ? Option.some(toFilm(row)) : Option.none()
          }),
        ),

      save: (film): Effect.Effect<void, PersistenceError> =>
        query(
          sql`INSERT INTO groupbuy_films (id, name, brand, format, iso, process, cover_image_url, description, features, scenarios, sample_images, base_price_in_cents, threshold, group_buy_price_in_cents)
              VALUES (${film.id}, ${film.name}, ${film.brand}, ${film.format}, ${film.iso}, ${film.process}, ${film.coverImageUrl}, ${film.description}, ${JSON.stringify(film.features)}::jsonb, ${JSON.stringify(film.scenarios)}::jsonb, ${JSON.stringify(film.sampleImages)}::jsonb, ${film.basePriceInCents}, ${film.deal.threshold}, ${film.deal.groupBuyPriceInCents})
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

    // 种子数据：按 ID 补齐尚未入库的商品（空表则全量写入）。
    // 已存在的记录不覆盖，保留管理端与用户的编辑结果；新品上架由此生效。
    // 失败只告警不中断启动（如表未建，迁移未跑）。
    yield* findAll.pipe(
      Effect.map((existing) => new Set(existing.map((f) => String(f.id)))),
      Effect.flatMap((existingIds) => {
        const missing = seedFilms().filter((f) => !existingIds.has(String(f.id)))
        if (missing.length === 0) return Effect.void
        return Effect.forEach(missing, (film) => repo.save(film), { discard: true }).pipe(
          Effect.tap(Effect.logInfo(`film 表补齐种子数据 ${missing.length} 条`)),
        )
      }),
      Effect.tapError((e) =>
        Effect.logWarning(`film 表种子数据初始化失败（请检查迁移是否执行）: ${e.message}`),
      ),
      Effect.ignore,
    )

    return repo
  }),
)
