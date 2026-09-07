# groupbuy — 胶卷团购（核心域）· M1 已实现

第一个完整业务模块：**直接进入商品页 → 选好位置点 → 参团心愿单（数量）→ 支付订金 → 等待成团**。
动线设计：商品为全局资产，用户可**先选胶卷再选位置点**；位置点选定后在 localStorage 持久化并复用，无需每次重复选择。

## 已实现能力

- 位置点（Hub 聚合）：查看支持团购的位置点、加入位置点（去重、关闭校验）
- 胶卷商品（Film 聚合）：特性 / 适用场景 / 冲洗工艺 / 135 与 120 画幅区分 / 真实商品图（Wikimedia Commons）
- 拼团（GroupBuy 聚合）：加入心愿单 = 参团，**可指定数量**；成团按**累计件数**判定（Σ数量 ≥ threshold），自动成团并发出 `GroupBuySucceeded` 事件；参团记录携带订单摘要（单价 / 总价 / 订金 10% / 货到付款）与订金支付状态
- 冲洗样片：multipart 上传（Effect `HttpApiSchema.Multipart`），本地磁盘存储（`ImageStorage` 端口，可替换 OSS），静态读取接口
- 拼团进度轮询：`GET /hubs/:hubId/films/:filmId/progress`

```
domain/          Hub / Film / GroupBuy 聚合、SampleImage 值对象、领域事件、仓储与图片存储端口
application/     GroupBuyService（listHubs / joinHub / listFilms / getFilm / joinGroupBuy(数量) / payDeposit / getProgress / uploadSampleImage）
infrastructure/  内存仓储 + mock 种子（9 款胶卷：5×135 + 4×120）、本地磁盘图片存储
interface/       GroupBuyApi（HttpApi 路由 + DTO + OpenAPI）
```

## Mock 说明（后续接真实数据）

- 成团优惠条件（threshold / 成团价）为与商家谈判结果的 mock，在 `infrastructure/groupBuyInMemory.ts` 种子数据中
- 商品封面已替换为真实胶卷图（Wikimedia Commons 自由授权，存于 `assets/films/*.jpg`）；仅 Fujifilm PRO 400H（120）暂缺可靠图，仍用占位插画
- 用户身份为 `x-user-id` 请求头占位（前端 localStorage 匿名 ID），接入微信登录后替换
- SQL 仓储与 OSS 图片存储待接入（沿用 identity 的 PersistenceLive 模式）；订金支付为**模拟标记**，未接真实支付网关

## API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/groupbuy/hubs | 位置点列表 |
| POST | /api/groupbuy/hubs/:id/join | 加入位置点 |
| GET | /api/groupbuy/films | 全局商品列表（不依赖位置点） |
| GET | /api/groupbuy/films/:filmId | 全局商品详情（不依赖位置点） |
| GET | /api/groupbuy/hubs/:hubId/films | 某位置点商品列表（含拼团进度） |
| GET | /api/groupbuy/hubs/:hubId/films/:filmId | 商品详情 |
| POST | /api/groupbuy/hubs/:hubId/films/:filmId/join | 加入心愿单（body: `{quantity}`，可指定数量） |
| POST | /api/groupbuy/hubs/:hubId/films/:filmId/pay-deposit | 支付订金（模拟，总金额 10%） |
| GET | /api/groupbuy/hubs/:hubId/films/:filmId/progress | 拼团进度 |
| POST | /api/groupbuy/films/:filmId/images | 上传样片（multipart） |
| GET | /api/groupbuy/images/:key 等 | 图片读取（uploads / films / demo） |
