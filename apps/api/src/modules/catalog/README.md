# catalog — 摄影服务目录（支撑域）· M1

商家与摄影套餐（旅拍 / 写真 / 课程 / 器材）的目录信息。

```
domain/          Merchant 聚合、Product（套餐）聚合、类目值对象、目录错误、仓储端口
application/     CatalogService（上架 / 下架 / 查询 / 档期查询）
infrastructure/  SQL 仓储、对象存储（套餐图）
interface/       CatalogApi（/api/catalog/**）
```

## 规划中的聚合与规则
- `Merchant`（商家）：资质状态机（Pending → Approved → Suspended）
- `Product`（摄影套餐）：标题、类目、原价、图集、有效期；上架需商家已审核
- 值对象：`Money`、`Category`（旅拍/写真/约拍/课程/器材）、`Location`（城市/门店）
