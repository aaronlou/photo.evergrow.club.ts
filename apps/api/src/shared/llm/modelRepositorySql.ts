import { Clock, Effect, Layer, Option } from "effect"
import { SqlClient } from "@effect/sql"

import { PersistenceError } from "../errors.js"
import type { LlmProvider } from "./model.js"
import type { LlmModel, LlmModelId } from "./model.js"
import { LlmModel as LlmModelValue, makeLlmModelId } from "./model.js"
import { LlmModelRepository } from "./modelRepository.js"
import type { SeedLlmModel } from "./seedModels.js"
import { DEFAULT_SEED_MODEL_ID, seedLlmModels, seedModelId } from "./seedModels.js"

/** 把底层 SQL 错误映射为 PersistenceError，不向领域泄漏数据库细节 */
const query = <A, E>(self: Effect.Effect<A, E>): Effect.Effect<A, PersistenceError> =>
  self.pipe(
    Effect.mapError((e) =>
      new PersistenceError({ message: e instanceof Error ? e.message : String(e) }),
    ),
  )

/** LlmModelRepository SQL 实现（表结构见 migrations/0007_llm_models.sql） */
export const LlmModelRepositorySql = Layer.effect(
  LlmModelRepository,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = new Date(yield* Clock.currentTimeMillis)

    const toModel = (row: {
      id: string
      provider: string
      model: string
      label: string
      base_url: string | null
      temperature: number | string
      enabled: boolean
      is_default: boolean
      created_at: Date
    }): LlmModelValue =>
      new LlmModelValue({
        id: makeLlmModelId(row.id),
        provider: row.provider as LlmProvider,
        model: row.model,
        label: row.label ?? "",
        baseUrl: row.base_url ?? "",
        temperature: Number(row.temperature),
        enabled: Boolean(row.enabled),
        isDefault: Boolean(row.is_default),
        createdAt: new Date(row.created_at),
      })

    const SELECT = `SELECT id, provider, model, label, base_url, temperature, enabled, is_default, created_at FROM llm_models`

    const toList = (
      rows: unknown,
    ): ReadonlyArray<LlmModelValue> =>
      (rows as unknown as ReadonlyArray<Parameters<typeof toModel>[0]>).map(toModel)

    const buildSeeded = (s: SeedLlmModel): LlmModelValue =>
      LlmModelValue.create({
        id: makeLlmModelId(seedModelId(s)),
        provider: s.provider,
        model: s.model,
        label: s.label,
        temperature: s.temperature,
        createdAt: now,
      })

    const repo = LlmModelRepository.make({
      findAll: () =>
        query(sql`${sql.literal(SELECT)} ORDER BY is_default DESC, created_at DESC`).pipe(
          Effect.map(toList),
        ),

      findById: (id: LlmModelId) =>
        query(sql`${sql.literal(SELECT)} WHERE id = ${id}`).pipe(
          Effect.map((rows) => Option.fromNullable(toList(rows)[0])),
        ),

      findDefault: () =>
        query(sql`${sql.literal(SELECT)} WHERE is_default = true AND enabled = true`).pipe(
          Effect.map((rows) => Option.fromNullable(toList(rows)[0])),
        ),

      save: (model: LlmModel) =>
        query(
          sql`INSERT INTO llm_models (id, provider, model, label, base_url, temperature, enabled, is_default, created_at)
              VALUES (${model.id}, ${model.provider}, ${model.model}, ${model.label}, ${model.baseUrl}, ${model.temperature}, ${model.enabled}, ${model.isDefault}, ${model.createdAt})
              ON CONFLICT (id) DO UPDATE SET
                provider = EXCLUDED.provider,
                model = EXCLUDED.model,
                label = EXCLUDED.label,
                base_url = EXCLUDED.base_url,
                temperature = EXCLUDED.temperature,
                enabled = EXCLUDED.enabled,
                is_default = EXCLUDED.is_default`,
        ).pipe(Effect.asVoid),

      // 一条语句原子完成"清掉其它默认 + 设本条为默认"；
      // is_default 上的唯一部分索引会兜住并发重复默认的极端情况
      setDefault: (id: LlmModelId) =>
        query(sql`UPDATE llm_models SET is_default = (id = ${id})`).pipe(Effect.asVoid),

      delete: (id: LlmModelId) =>
        query(sql`DELETE FROM llm_models WHERE id = ${id}`).pipe(Effect.asVoid),
    })

    // 种子补齐：按 id 补进尚未入库的模型（已存在的不覆盖，保留管理员编辑）。
    // 失败只告警不阻断启动（如表未建、迁移未跑）。
    yield* repo
      .findAll()
      .pipe(
        Effect.map((existing) => new Set(existing.map((m) => String(m.id)))),
        Effect.flatMap((existingIds) => {
          const missing = seedLlmModels.filter((s) => !existingIds.has(seedModelId(s)))
          if (missing.length === 0) return Effect.void
          return Effect.forEach(missing, (s) => repo.save(buildSeeded(s)), { discard: true }).pipe(
            Effect.tap(Effect.logInfo(`llm_models 表补齐种子数据 ${missing.length} 条`)),
          )
        }),
        Effect.tapError((e) =>
          Effect.logWarning(`llm_models 种子初始化失败（请检查迁移是否执行）: ${e.message}`),
        ),
        Effect.ignore,
      )

    // 若当前没有任何默认 → 把种子默认那条设为默认（避免"系统没有默认模型"空窗）
    yield* repo
      .findDefault()
      .pipe(
        Effect.flatMap((opt) =>
          Option.isNone(opt)
            ? repo.setDefault(makeLlmModelId(DEFAULT_SEED_MODEL_ID))
            : Effect.void,
        ),
        Effect.catchAll(() => Effect.void),
      )

    return repo
  }),
)
