import { Schema } from "effect"

export const HubId = Schema.String.pipe(Schema.brand("HubId"))
export type HubId = Schema.Schema.Type<typeof HubId>

export const makeHubId = (raw: string): HubId => Schema.decodeSync(HubId)(raw)

export const HubStatus = Schema.Literal("Active", "Closed")
export type HubStatus = Schema.Schema.Type<typeof HubStatus>

/**
 * Hub 聚合：团购位置点（取货/成团点）。
 * 用户加入位置点后，即可在该点参与胶卷团购。
 */
export class Hub extends Schema.Class<Hub>("Hub")({
  id: HubId,
  name: Schema.String,
  city: Schema.String,
  address: Schema.String,
  joinedUserIds: Schema.Array(Schema.String),
  status: HubStatus,
  createdAt: Schema.DateFromSelf,
}) {
  static create(input: {
    id: HubId
    name: string
    city: string
    address: string
    createdAt: Date
  }): Hub {
    return new Hub({
      id: input.id,
      name: input.name,
      city: input.city,
      address: input.address,
      joinedUserIds: [],
      status: "Active",
      createdAt: input.createdAt,
    })
  }

  hasJoined(userId: string): boolean {
    return this.joinedUserIds.includes(userId)
  }

  memberCount(): number {
    return this.joinedUserIds.length
  }

  /** 领域规则：同一用户只能加入一次（去重由用例层校验后调用） */
  join(userId: string): Hub {
    return new Hub({ ...this, joinedUserIds: [...this.joinedUserIds, userId] })
  }
}
