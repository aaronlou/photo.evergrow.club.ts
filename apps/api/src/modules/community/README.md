# community — 社区（支撑域）· M4（二期）

作品分享、晒单与评价，增强摄影人群的社区属性。

```
domain/          Post（作品帖）聚合、Review（评价）聚合、仓储端口
application/     CommunityService（发帖 / 晒单 / 评价 / 精选）
infrastructure/  对象存储（图片）、内容审核适配
interface/       CommunityApi（/api/community/**）
```

## 要点
- 图片走对象存储（MinIO / OSS），数据库只存资源路径
- 评价需关联已核销订单（依赖 ordering/redemption 端口做校验）
