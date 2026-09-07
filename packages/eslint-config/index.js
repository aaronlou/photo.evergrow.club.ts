import tseslint from "typescript-eslint"

/** 共享 ESLint 基础配置（flat config），各 app 在此基础上追加规则 */
export default tseslint.config(
  {
    ignores: ["node_modules/**", "dist/**", "coverage/**", ".turbo/**"],
  },
  tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
)
