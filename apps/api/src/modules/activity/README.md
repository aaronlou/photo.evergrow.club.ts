# activity — 活动与报名（支撑域）

管理员/组织者创建活动，用户报名参加；报名受**名额上限 + 报名时间窗口**约束。

```
domain/          Activity 聚合根、ActivityId 品牌类型、状态机（NotStarted/Open/Full/Closed/Ended）、
                 领域错误、领域事件、ActivityRepository 端口
application/     ActivityService 用例（create / listActivities / listMyActivities / getActivity /
                 enroll / cancelEnrollment）
infrastructure/  ActivityRepositoryInMemory（默认，含种子活动，零依赖启动）
                 ActivityRepositorySql（PostgreSQL，migrations/0002_activity.sql）
interface/       ActivityApi（/api/activity/activities, /mine, /:id/cancel，HttpApi 路由 + DTO + OpenAPI）
```

仓储按环境切换：配置 `DATABASE_URL` → `ActivityRepositorySql`；否则回落到 `ActivityRepositoryInMemory`（含种子数据）。

## 报名 / 取消
- `enroll`：名额 + 报名时间窗口校验，通过后追加报名并发布 `ActivityEnrolled` 事件
- `cancelEnrollment`：活动未结束前可退出（`NotEnrolled` / `ActivityEnded` 校验），人数回退后满员态自动解除

## 状态机（按当前时间 + 名额推导，纯函数）
- `NotStarted`：尚未到报名开始时间
- `Open`：报名进行中（在窗口内且未满员）
- `Full`：已满员
- `Closed`：报名已截止
- `Ended`：活动已结束

## 报名规则（enroll）
1. 已在报名列表 → `AlreadyEnrolled`
2. 活动已结束 → `ActivityEnded`
3. 未到报名开始 → `SignupNotStarted`
4. 报名已截止 → `SignupClosed`
5. 已满员 → `ActivityFull`
6. 通过 → 追加报名，发布 `ActivityEnrolled` 事件（目前仅日志）

## 权限
当前为骨架阶段，创建接口**暂不鉴权**（任何人可创建）；接入 identity `role` 后收紧为仅管理员可创建。
