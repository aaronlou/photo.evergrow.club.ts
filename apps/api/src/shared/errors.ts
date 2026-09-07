import { Schema } from "effect"

/** 通用领域错误（各上下文领域错误定义在各自 domain/errors.ts） */
export class NotFoundError extends Schema.TaggedError<NotFoundError>("NotFoundError")(
  "NotFoundError",
  { id: Schema.String },
) {}

export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>("UnauthorizedError")(
  "UnauthorizedError",
  { message: Schema.String },
) {}

/**
 * 持久化错误：基础设施层（如 SQL 适配器）把底层错误映射为该领域错误，
 * 避免数据库具体错误类型泄漏进领域层。
 */
export class PersistenceError extends Schema.TaggedError<PersistenceError>("PersistenceError")(
  "PersistenceError",
  { message: Schema.String },
) {}
