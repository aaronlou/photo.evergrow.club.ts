# identity — 身份与账户（支撑域）

完整实现了 DDD 分层 + Effect 端口/适配器模式，作为其他上下文的模板。

```
domain/         User / Session 聚合根、UserId 与 PasswordHash 品牌类型、领域错误、仓储端口
application/    UserService 用例（register / login / logout / currentUser / getProfile）
infrastructure/ 内存与 SQL 双仓储（User / Session）+ scrypt 密码哈希适配器
interface/      IdentityApi（HttpApi 路由 + DTO 契约 + OpenAPI）
```

## 认证模型

- **密码**：scrypt 慢哈希（自描述存储格式 `scrypt$N$r$p$salt$key`，参数随密文走），恒定时间比较防时序攻击；明文只在用例入口短暂存在
- **会话**：不透明令牌（UUID v4）+ `sessions` 表（可随时吊销，登出即删行，30 天过期惰性清理）；未选 JWT 的理由：单体应用优先可撤销性，无需管理签名密钥
- **登录失败防枚举**：用户不存在 / 密码错 / 账号禁用统一报 `InvalidCredentials`（401）
- **全局身份解析**：`src/interface/auth.ts` 的 `currentUserId(request, users)`——有效 Bearer token → 服务端验证会话返回真实 userId；否则匿名回退（x-user-id 头），groupbuy / activity 已全部接入

## API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/identity/users | 注册（phone / nickname / password） |
| GET | /api/identity/users/:id | 用户资料 |
| POST | /api/identity/sessions | 登录 → `{ token, user }` |
| DELETE | /api/identity/sessions | 登出（吊销 Bearer 令牌，幂等） |
| GET | /api/identity/me | 当前用户（Authorization: Bearer） |

## 规划中的能力
- [ ] 找回密码（SmsSender 端口 + 验证码聚合，dev 环境用日志 Mock）
- [ ] 微信登录（OAuth 适配器在 infrastructure 层）
- [ ] 用户摄影偏好画像（器材 / 风格标签，值对象 `PhotographyProfile`）
- [ ] 管理端禁用/启用用户

## 数据库
`users` 表见 `migrations/0001_init.sql`（密码列见 0005）；`sessions` 表见 0006。
