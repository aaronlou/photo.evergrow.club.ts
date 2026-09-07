import { Effect } from "effect"

import { PersistenceError } from "../../../shared/errors.js"

/** 已存储的图片 */
export interface StoredImage {
  readonly key: string
  readonly url: string
}

export interface ImageUploadInput {
  /** 已落到磁盘的临时文件路径（multipart 中间件产物） */
  readonly fromPath: string
  readonly name: string
  readonly contentType: string
}

/**
 * 图片存储端口：把上传的临时文件归档到持久存储（本地磁盘 / OSS），返回可访问 URL。
 * 实现见 infrastructure/imageStorageLocal.ts。
 */
export class ImageStorage extends Effect.Service<ImageStorage>()("ImageStorage", {
  effect: Effect.gen(function* () {
    return {
      store: (_input: ImageUploadInput): Effect.Effect<StoredImage, PersistenceError> =>
        Effect.fail(new PersistenceError({ message: "ImageStorage 未装配" })),
      /** 按 key 删除已存储的图片（文件不存在视为成功） */
      remove: (_key: string): Effect.Effect<void, PersistenceError> => Effect.void,
    }
  }),
}) {}
