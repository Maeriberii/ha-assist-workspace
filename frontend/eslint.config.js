import tseslint from "typescript-eslint";

export default [
  ...tseslint.configs.recommended,
  {
    files: ["**/*.js", "**/*.ts"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module" },
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
];
