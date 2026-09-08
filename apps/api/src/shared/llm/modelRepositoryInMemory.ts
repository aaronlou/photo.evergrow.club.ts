import { Clock, Effect, Layer, Option, Ref } from "effect"

import type { LlmModel, LlmModelId } from "./model.js"
import { LlmModel as LlmModelValue, makeLlmModelId } from "./model.js"
import { LlmModelRepository } from "./modelRepository.js"
import { DEFAULT_SEED_MODEL_ID, seedLlmModels, seedModelId } from "./seedModels.js"

/**
 * LlmModelRepository 内存实现：本地开发零依赖。
 * 启动时写入模型目录种子（已存在的 id 不覆盖，保留管理员编辑）；进程重启即丢。
 */
export const LlmModelRepositoryInMemory = Layer.effect(
  LlmModelRepository,
  Effect.gen(function* () {
    const now = new Date(yield* Clock.currentTimeMillis)
    const seeded = new Map<string, LlmModel>(
      seedLlmModels.map((s) => {
        const id = seedModelId(s)
        const model = LlmModelValue.create({
          id: makeLlmModelId(id),
          provider: s.provider,
          model: s.model,
          label: s.label,
          temperature: s.temperature,
          createdAt: now,
        })
        return [id, id === DEFAULT_SEED_MODEL_ID ? model.markDefault() : model]
      }),
    )
    const store = yield* Ref.make(seeded)

    return LlmModelRepository.make({
      findAll: () => Ref.get(store).pipe(Effect.map((m) => [...m.values()])),

      findById: (id: LlmModelId) =>
        Ref.get(store).pipe(Effect.map((m) => Option.fromNullable(m.get(id)))),

      findDefault: () =>
        Ref.get(store).pipe(
          Effect.map((m) =>
            Option.fromNullable([...m.values()].find((x) => x.isDefault && x.enabled)),
          ),
        ),

      save: (model: LlmModel) => Ref.update(store, (m) => m.set(model.id, model)),

      setDefault: (id: LlmModelId) =>
        Ref.update(store, (m) => {
          for (const [key, value] of m) {
            m.set(key, key === id ? value.markDefault() : value.clearDefault())
          }
          return m
        }),

      delete: (id: LlmModelId) =>
        Ref.update(store, (m) => {
          m.delete(id)
          return m
        }),
    })
  }),
)
