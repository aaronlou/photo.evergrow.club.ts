# redemption — 核销（支撑域）· M3

券码生成、到店核销与退款联动。

```
domain/          Voucher 聚合（券码状态机：Issued → Redeemed / Expired / Refunded）、仓储端口
application/     RedemptionService（发券 / 核销 / 作废）
infrastructure/  SQL 仓储、核销端（商家后台/小程序端）接口
interface/       RedemptionApi（/api/redemption/**）
```

## 要点
- 券码一次性、防重放（核销幂等）
- 商家端核销需商家身份鉴权（依赖 identity 端口）
