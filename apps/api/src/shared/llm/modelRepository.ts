import { Effect, Option } from "effect"

import type { PersistenceError } from "../errors.js"
import type { LlmModel, LlmModelId } from "./model.js"

/**
 * LlmModelRepository 端口：模型配置的存取。
 * 实现见 modelRepositoryInMemory.ts / modelRepositorySql.ts，组合根按 DATABASE_URL 装配。
 */
export class LlmModelRepository extends Effect.Service<LlmModelRepository>()(
  "LlmModelRepository",
  {
    effect: Effect.gen(function* () {
      return {
        findAll: (): Effect.Effect<ReadonlyArray<LlmModel>, PersistenceError> => Effect.succeed([]),

        findById: (_id: LlmModelId): Effect.Effect<Option.Option<LlmModel>, PersistenceError> =>
          Effect.succeed(Option.none()),

        /** 当前生效的默认模型（未设置/全部禁用时返回 None → 调用方回落到环境变量默认） */
        findDefault: (): Effect.Effect<Option.Option<LlmModel>, PersistenceError> =>
          Effect.succeed(Option.none()),

        save: (_model: LlmModel): Effect.Effect<void, PersistenceError> => Effect.void,

        /**
         * 设为默认（不变量：全局至多一个默认）。
         * 由实现保证"清掉其它默认 + 设本条"的原子性——不让调用方拼两个操作。
         */
        setDefault: (_id: LlmModelId): Effect.Effect<void, PersistenceError> => Effect.void,

        delete: (_id: LlmModelId): Effect.Effect<void, PersistenceError> => Effect.void,
      }
    }),
  },
) {}
