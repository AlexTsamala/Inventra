import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  eslintConfigPrettier,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
    },
  },
  {
    // NestJS modules are classes whose only job is to carry the `@Module()`
    // decorator's metadata — an empty body is the idiom, not a smell.
    files: ["**/*.module.ts"],
    rules: {
      "@typescript-eslint/no-extraneous-class": "off",
    },
  },
  {
    // Config files written as CommonJS (e.g. .dependency-cruiser.cjs) use
    // module/require directly — ESLint's flat config has no Node globals by default.
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        module: "writable",
        exports: "writable",
        require: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        process: "readonly",
      },
    },
  },
  {
    ignores: ["**/dist/**", "**/.turbo/**", "**/.next/**", "**/node_modules/**"],
  },
);
