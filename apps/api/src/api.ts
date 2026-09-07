import { HttpApi } from "@effect/platform"

import { HealthApi } from "./interface/healthApi.js"
import { GroupBuyApi } from "./modules/groupbuy/interface/groupBuyApi.js"
import { IdentityApi } from "./modules/identity/interface/identityApi.js"

/**
 * 根 API：所有限界上下文的 HttpApiGroup 在这里挂载，
 * 未来新增上下文只需再加一个 .add(SomeGroup.prefix("/xxx"))。
 */
export const Api = HttpApi.make("EvergrowApi")
  .add(HealthApi.prefix("/health"))
  .add(IdentityApi.prefix("/identity"))
  .add(GroupBuyApi.prefix("/groupbuy"))
  .prefix("/api")
