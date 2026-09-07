import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform"

export const HealthDto = Schema.Struct({
  status: Schema.Literal("ok"),
  timestamp: Schema.String,
})

export const HealthApi = HttpApiGroup.make("health")
  .add(HttpApiEndpoint.get("check", "/").addSuccess(HealthDto))
