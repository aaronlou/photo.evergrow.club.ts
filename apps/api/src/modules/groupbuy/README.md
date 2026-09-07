# groupbuy — 拼团（核心域）· M2

团购活动与拼团过程，是产品价值的核心。

```
domain/          GroupBuy（团购活动）聚合根、Group（团）实体、Participant（参团记录）、
                 PriceLadder（阶梯价）值对象、成团/流团领域事件、仓储端口
application/     GroupBuyService（开团 / 参团 / 退团 / 查询团进度）
infrastructure/  SQL 仓储、Redis 名额并发控制
interface/       GroupBuyApi（/api/groupbuy/**）
```

## 核心状态机
- `GroupBuy`：Draft → Open → SoldOut / Ended（活动维度）
- `Group`：Forming → Succeeded / Failed（团维度，受时间限制）
- 成团 → 发布 `GroupSucceeded` 事件；流团 → 发布 `GroupFailed` 事件，ordering 上下文据此自动退款
- 参团人数与剩余名额是强一致热点：用聚合内计数 + 数据库唯一约束兜底
