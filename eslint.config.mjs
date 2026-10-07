import reactHooks from "eslint-plugin-react-hooks"
import tsParser from "@typescript-eslint/parser"
import globals from "globals"

export default [
  {
    ignores: [
      "build/**",
      ".react-router/**",
      "node_modules/**",
      ".wrangler/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx,mts}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
]
