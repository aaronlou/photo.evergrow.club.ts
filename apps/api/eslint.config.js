import base from "@evergrow/eslint-config"
import boundaries from "eslint-plugin-boundaries"

/**
 * DDD 分层边界（eslint-plugin-boundaries）：
 *   domain        -> 只允许依赖 shared
 *   application   -> 只允许依赖 domain / shared
 *   infrastructure-> 只允许依赖 domain / shared
 *   interface     -> 只允许依赖 application / domain / shared
 * 组合根（src/main.ts 等 include 之外的根文件）是唯一允许组装各层的例外。
 */
export default [
  ...base,
  {
    plugins: { boundaries },
    settings: {
      "boundaries/include": ["src/**/*"],
      "boundaries/elements": [
        { type: "domain", pattern: ["src/modules/*/domain/**"], allow: ["shared"] },
        { type: "application", pattern: ["src/modules/*/application/**"], allow: ["domain", "shared"] },
        { type: "infrastructure", pattern: ["src/modules/*/infrastructure/**"], allow: ["domain", "shared"] },
        {
          type: "interface",
          pattern: ["src/modules/*/interface/**", "src/interface/**"],
          allow: ["application", "domain", "shared"],
        },
        { type: "shared", pattern: ["src/shared/**"], allow: ["shared"] },
      ],
    },
    rules: {
      "boundaries/element-types": "error",
    },
  },
  {
    files: ["src/main.ts"],
    rules: {
      "boundaries/element-types": "off",
    },
  },
]
