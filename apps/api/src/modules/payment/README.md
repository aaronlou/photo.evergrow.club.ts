# payment — 支付（通用域 / 防腐层）· M2

隔离微信支付 / 支付宝等外部网关模型，只对外暴露本域的支付端口。

```
domain/          Payment 聚合、PaymentChannel 值对象、PaymentGateway 端口
application/     PaymentService（发起支付 / 回调验签 / 查询）
infrastructure/  WechatPayGateway / AlipayGateway 适配器（防腐层 ACL）
interface/       支付回调入口（/api/payment/callback/**）
```

## 防腐层要点
- 外部网关的报文模型只存在于 infrastructure 层，不泄漏进领域层
- 回调验签、幂等（重复回调）、对账任务
