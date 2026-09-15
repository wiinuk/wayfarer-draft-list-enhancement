import eslint from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist", "dev", "node_modules", ".private", "*.user.js"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
);
