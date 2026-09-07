# ordering — 订单（核心域）· M2

订单与档期预约。与 groupbuy 通过领域事件联动（流团自动退款），只持有 `groupBuyId` 外部引用，不跨聚合导航。

```
domain/          Order 聚合根（状态机）、OrderItem、Appointment（档期预约）值对象、仓储端口
application/     OrderService（创建订单 / 支付确认 / 取消 / 退款）
infrastructure/  SQL 仓储、支付网关回调适配（依赖 payment 上下文端口）
interface/       OrderApi（/api/orders/**）
```

## 核心状态机
- `Order`：PendingPayment → Paid → Redeemed / Refunding / Refunded / Cancelled
- 成团前订单处于 PendingPayment，`GroupFailed` 事件触发批量取消+退款
