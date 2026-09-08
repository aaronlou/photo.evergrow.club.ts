import { Clock, Effect, Option } from "effect"

import type { PersistenceError } from "../errors.js"
import { NotFoundError } from "../errors.js"
import { IdGenerator } from "../kernel.js"
import type { LlmModel } from "./model.js"
import { LlmModel as LlmModelValue, makeLlmModelId } from "./model.js"
import type { LlmModelId, LlmProvider } from "./model.js"
import { LlmModelRepository } from "./modelRepository.js"
import { llmSettings } from "./llmClient.js"

/** 管理端可见的"当前接入点"信息（不含密钥，仅用于页面提示模型是否兼容） */
export interface LlmEndpointInfo {
  provider: string
  baseUrl: string
  /** 环境变量里的默认模型（未设置默认记录时的回落） */
  fallbackModel: string
}

/**
 * LlmModelService：模型配置的用例层。
 * 运营规则：
 * - 新增的第一个模型自动成为默认（避免"没有默认"的空窗）
 * - 删除默认模型后，自动把剩余启用项的第一个补为默认
 * - 改默认/增删都经由仓储的不变量保证（全局至多一个默认）
 */
export class LlmModelService extends Effect.Service<LlmModelService>()("LlmModelService", {
  effect: Effect.gen(function* () {
    const repo = yield* LlmModelRepository
    const idgen = yield* IdGenerator

    const slug = (raw: string): string =>
      raw
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")

    return {
      list: (): Effect.Effect<ReadonlyArray<LlmModel>, PersistenceError> => repo.findAll(),

      /** 当前生效模型：优先默认记录；无记录则回落到环境变量默认（不落库） */
      current: (): Effect.Effect<Option.Option<LlmModel>, PersistenceError> => repo.findDefault(),

      /** 当前接入点（来自环境变量，页面据此提示模型兼容性） */
      endpoint: (): Effect.Effect<LlmEndpointInfo> =>
        llmSettings.pipe(
          Effect.map((maybe) =>
            Option.match(maybe, {
              onNone: () => ({ provider: "未配置", baseUrl: "", fallbackModel: "" }),
              onSome: (s) => ({ provider: s.provider, baseUrl: s.baseUrl, fallbackModel: s.model }),
            }),
          ),
        ),

      create: (input: {
        provider: LlmProvider
        model: string
        label: string
        baseUrl?: string
        temperature: number
      }): Effect.Effect<LlmModel, PersistenceError> =>
        Effect.gen(function* () {
          const base = `${slug(input.provider)}-${slug(input.model)}`
          let id = makeLlmModelId(base)
          // ID 冲突（换 label 重复添加同一模型）时追加随机后缀，避免静默覆盖
          const existingById = yield* repo.findById(id)
          if (Option.isSome(existingById)) {
            id = makeLlmModelId(`${base}-${(yield* idgen.nextUUID).slice(0, 8)}`)
          }
          const created = LlmModelValue.create({
            id,
            provider: input.provider,
            model: input.model,
            label: input.label,
            baseUrl: input.baseUrl ?? "",
            temperature: input.temperature,
            createdAt: new Date(yield* Clock.currentTimeMillis),
          })
          const existing = yield* repo.findAll()
          // 运营规则：首个新增的模型直接作为默认
          if (existing.length === 0) {
            yield* repo.save(created.markDefault())
            return created.markDefault()
          }
          yield* repo.save(created)
          return created
        }),

      update: (
        id: LlmModelId,
        patch: { label?: string; baseUrl?: string; temperature?: number; enabled?: boolean },
      ): Effect.Effect<LlmModel, PersistenceError | NotFoundError> =>
        Effect.gen(function* () {
          const found = yield* repo.findById(id)
          if (Option.isNone(found)) {
            return yield* Effect.fail(new NotFoundError({ id }))
          }
          let updated = found.value
          if (patch.label !== undefined) updated = updated.renameLabel(patch.label)
          if (patch.baseUrl !== undefined) updated = updated.setBaseUrl(patch.baseUrl)
          if (patch.temperature !== undefined) updated = updated.setTemperature(patch.temperature)
          if (patch.enabled !== undefined) updated = updated.setEnabled(patch.enabled)
          yield* repo.save(updated)
          return updated
        }),

      setDefault: (id: LlmModelId): Effect.Effect<void, PersistenceError> => repo.setDefault(id),

      remove: (id: LlmModelId): Effect.Effect<void, PersistenceError> =>
        Effect.gen(function* () {
          const found = yield* repo.findById(id)
          const wasDefault = Option.isSome(found) && found.value.isDefault
          yield* repo.delete(id)
          // 删掉了默认 → 把剩余启用项的第一个补为默认，避免空窗
          if (wasDefault) {
            const rest = yield* repo.findAll()
            const next = rest.find((m) => m.enabled)
            if (next) yield* repo.setDefault(next.id)
          }
        }),
    }
  }),
}) {}
