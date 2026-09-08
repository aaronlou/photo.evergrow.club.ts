import { Effect, Schema } from "effect"

/**
 * 密码哈希（品牌类型）：一段由 PasswordHasher 生成的自描述密文，
 * 例如 "scrypt$16384$8$1$salt$derivedKey"。
 * 领域层永远不接触明文密码的存储，明文只在用例入口短暂存在。
 */
export const PasswordHash = Schema.String.pipe(Schema.brand("PasswordHash"))
export type PasswordHash = Schema.Schema.Type<typeof PasswordHash>

export const makePasswordHash = (raw: string): PasswordHash =>
  Schema.decodeSync(PasswordHash)(raw)

/**
 * PasswordHasher 端口：密码单向哈希与校验。
 * 算法（scrypt/bcrypt/argon2）属于技术细节，实现放在 infrastructure 层，
 * 领域与用例层只依赖此端口——换算法不影响任何业务代码。
 */
export class PasswordHasher extends Effect.Service<PasswordHasher>()("PasswordHasher", {
  effect: Effect.gen(function* () {
    return {
      /** 把明文密码哈希为可存储的密文（含随机盐） */
      hash: (_password: string): Effect.Effect<PasswordHash> =>
        Effect.gen(function* () {
          return yield* Effect.die("PasswordHasher 未装配：组合根需提供真实实现")
        }),

      /** 校验明文密码是否与存储密文匹配（恒定时间比较，防时序攻击） */
      verify: (_password: string, _stored: PasswordHash): Effect.Effect<boolean> =>
        Effect.gen(function* () {
          return yield* Effect.die("PasswordHasher 未装配：组合根需提供真实实现")
        }),
    }
  }),
}) {}
