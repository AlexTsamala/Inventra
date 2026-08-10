import baseConfig from "@inventra/eslint-config";

export default [
  ...baseConfig,
  {
    ignores: ["dist/**"],
  },
];
