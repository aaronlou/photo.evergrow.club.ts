# identity — 身份与账户（支撑域）

完整实现了 DDD 分层 + Effect 端口/适配器模式，作为其他上下文的模板。

```
domain/         User 聚合根、UserId 品牌类型、领域错误、领域事件、UserRepository 端口
application/    UserService 用例（register / getProfile），编排领域对象与事务边界
infrastructure/ UserRepositoryInMemory（默认，零依赖启动）/ UserRepositorySql（PostgreSQL 实现）
interface/      IdentityApi（HttpApi 路由 + UserDto 契约 + OpenAPI）
```

## 规划中的能力
- [ ] 微信登录（OAuth 适配器在 infrastructure 层）
- [ ] 用户摄影偏好画像（器材 / 风格标签，值对象 `PhotographyProfile`）
- [ ] 管理端禁用/启用用户

## 数据库
`users` 表见 `apps/api/migrations/0001_init.sql`。
