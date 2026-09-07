# 限界上下文与上下文映射

## 上下文总览

| 上下文 | 定位 | 核心职责 | 里程碑 |
|---|---|---|---|
| `identity` | 支撑域 | 注册登录（微信登录）、用户摄影偏好画像 | ✅ M0 完整示例 |
| `catalog` | 支撑域 | 商家、摄影套餐（旅拍/写真/课程/器材）、类目 | M1 |
| `groupbuy` | **核心域** | 团购活动、开团/参团、阶梯价、成团与流团规则 | M2 |
| `activity` | 支撑域 | 线下/线上活动、创建与报名（名额 + 报名时间窗口） | 本期新增 |
| `ordering` | **核心域** | 订单、档期预约、订单状态机 | M2 |
| `payment` | 通用域（防腐层） | 微信支付/支付宝，隔离外部网关模型 | M2 |
| `redemption` | 支撑域 | 券码发放与核销、退款联动 | M3 |
| `community` | 支撑域（二期） | 作品分享、晒单、评价 | M4 |

## 上下文映射（关系）

```
        catalog ──productId──▶ groupbuy ──groupBuyId──▶ ordering ──paymentId──▶ payment
            ▲                                        │      ▲
            │                                   GroupFailed│  │订单已支付
        identity ◀────────────── userId 引用 ──────┴──────┘  │
            ▲                                                ▼
            └──────────── merchantId 引用 ────────────▶ redemption
                                                             ▲
                                                             │ 评价需关联已核销订单
                                                          community
```

## 关键协作规则

- **聚合间只持有外部引用（ID）**：`Order` 持有 `groupBuyId`，不直接导航 `GroupBuy` 对象
- `activity` 为独立上下文（活动 + 报名），仅通过 `createdBy` / 报名用户 ID 与 `identity` 松散关联，报名规则（名额 + 时间窗口）聚合内强一致
- **跨上下文通过领域事件最终一致**：
  - `GroupSucceeded`（成团）→ 订单进入可支付/已锁定状态
  - `GroupFailed`（流团）→ 批量取消订单并自动退款
  - `OrderPaid` → 发放券码（redemption）
- **防腐层（ACL）**：`payment` 上下文对外只暴露本域支付端口，微信/支付宝报文模型只存在于 infrastructure 层
- 每个模块内部结构的详细规划见 `apps/api/src/modules/*/README.md`

## 核心状态机（M2 实现）

- `GroupBuy`：Draft → Open → SoldOut / Ended
- `Group`：Forming → Succeeded / Failed（受成团时限约束）
- `Order`：PendingPayment → Paid → Redeemed / Refunding / Refunded / Cancelled
- `Voucher`：Issued → Redeemed / Expired / Refunded
