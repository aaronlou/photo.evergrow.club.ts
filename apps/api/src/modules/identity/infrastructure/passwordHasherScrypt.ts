import { Effect, Layer } from "effect"
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto"

import { makePasswordHash, PasswordHasher } from "../domain/password.js"

/**
 * PasswordHasher 的 scrypt 实现（Node.js 内置 crypto，无第三方依赖）。
 *
 * 存储格式（自描述，方便未来换参数/算法）：
 *   scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>
 *   - N：CPU/内存成本参数（2 的幂），r：块大小，p：并行度
 *   - salt：随机盐（每个密码独立，防彩虹表 + 相同密码哈希结果不同）
 *
 * 为什么不用 SHA-256/MD5：太快，GPU 每秒可爆破数十亿次；
 * scrypt 故意"慢 + 吃内存"，让大规模暴力破解成本高到不可行。
 */

const SCRYPT_N = 16384 // 16 MiB 内存（OWASP 推荐的下限量级）
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LEN = 64

/** 把 callback 风格的 node:crypto.scrypt 包装成 Effect（不阻塞事件循环） */
const scrypt = (
  password: string,
  salt: Buffer,
  params: { N: number; r: number; p: number },
): Effect.Effect<Buffer> =>
  Effect.promise(
    () =>
      new Promise<Buffer>((resolve, reject) =>
        scryptCallback(
          password,
          salt,
          KEY_LEN,
          { N: params.N, r: params.r, p: params.p },
          (err, key) => (err ? reject(err) : resolve(key)),
        ),
      ),
  )

export const PasswordHasherScrypt = Layer.succeed(
  PasswordHasher,
  PasswordHasher.make({
    hash: (password: string): Effect.Effect<ReturnType<typeof makePasswordHash>> =>
      Effect.gen(function* () {
        const salt = randomBytes(16)
        const key = yield* scrypt(password, salt, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
        // 组装自描述格式
        const stored = [
          "scrypt",
          SCRYPT_N,
          SCRYPT_R,
          SCRYPT_P,
          salt.toString("hex"),
          key.toString("hex"),
        ].join("$")
        return makePasswordHash(stored)
      }),

    verify: (password: string, stored): Effect.Effect<boolean> =>
      Effect.gen(function* () {
        // 解析存储格式，按当年写入时的参数重新计算一遍（参数随密文走，升级算法后旧密码仍可校验）
        const [algo, n, r, p, saltHex, hashHex] = stored.split("$")
        if (algo !== "scrypt" || !n || !r || !p || !saltHex || !hashHex) {
          return false // 格式不认识 → 一律视为不匹配（不抛错，防止探测）
        }
        const salt = Buffer.from(saltHex, "hex")
        const key = yield* scrypt(password, salt, { N: Number(n), r: Number(r), p: Number(p) })
        const expected = Buffer.from(hashHex, "hex")
        if (key.length !== expected.length) return false
        // 恒定时间比较：比较耗时与内容无关，防止逐字节猜测（时序攻击）
        return timingSafeEqual(key, expected)
      }),
  }),
)
