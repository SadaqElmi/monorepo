import { defineConfig } from "eslint/config";
import { nextJsConfig } from "@repo/eslint-config/next-js";

export default defineConfig([
  ...nextJsConfig,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
    },
  },
]);
