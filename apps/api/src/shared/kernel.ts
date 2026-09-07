import { Effect } from "effect"
import { randomUUID } from "node:crypto"

/** 共享内核：统一再导出 Effect 提供的基础服务（Clock / Logger / Random 等） */
export { Clock, Logger, Random } from "effect"

/** ID 生成服务：默认实现基于 node:crypto 的 UUID v4，测试可注入确定性实现 */
export class IdGenerator extends Effect.Service<IdGenerator>()("IdGenerator", {
  succeed: {
    nextUUID: Effect.sync(() => randomUUID()),
  },
}) {}
