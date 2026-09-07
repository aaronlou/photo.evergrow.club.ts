import { Effect, Layer } from "effect"
import { FileSystem } from "@effect/platform"
import { randomUUID } from "node:crypto"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { PersistenceError } from "../../../shared/errors.js"
import { ImageStorage } from "../domain/imageStorage.js"

/**
 * 图片存储本地磁盘实现：上传文件归档到 <api 包>/uploads，
 * 通过 /api/groupbuy/images/:key 访问。生产可替换为 OSS/S3 实现。
 */
// 按模块位置解析（不依赖 cwd）：src/modules/groupbuy/infrastructure → 上溯 4 级到 api 包根
export const uploadsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
  "uploads",
)

const mapPersistence = <A, E>(self: Effect.Effect<A, E>): Effect.Effect<A, PersistenceError> =>
  self.pipe(
    Effect.mapError((e) =>
      new PersistenceError({ message: e instanceof Error ? e.message : String(e) }),
    ),
  )

const extensionFor = (name: string, contentType: string): string => {
  const fromName = name.includes(".") ? (name.split(".").pop() ?? "") : ""
  const fromType = (contentType.split("/")[1] ?? "").replace(/\+.*$/, "")
  return fromName || fromType || "bin"
}

export const ImageStorageLocal = Layer.effect(
  ImageStorage,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    return ImageStorage.make({
      store: (input) =>
        Effect.gen(function* () {
          const key = `${randomUUID()}.${extensionFor(input.name, input.contentType)}`
          yield* mapPersistence(fs.makeDirectory(uploadsDir, { recursive: true }))
          yield* mapPersistence(fs.copyFile(input.fromPath, join(uploadsDir, key)))
          return { key, url: `/api/groupbuy/images/${key}` }
        }),
    })
  }),
)
