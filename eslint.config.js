import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: ["dashboard/.next/**", "dashboard/node_modules/**"]
  },
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        Bun: "readonly",
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        Buffer: "readonly",
        WebAssembly: "readonly",
        Headers: "readonly",
        Response: "readonly",
        URLSearchParams: "readonly",
        performance: "readonly",
        structuredClone: "readonly",
        window: "readonly"
      }
    },
    rules: {
      "no-console": "off"
    }
  },
  {
    files: ["scripts/verify/**/*.ts"],
    rules: {
      "no-unused-vars": "off"
    }
  },
  {
    files: ["tests/**/*.ts", "scripts/test/**/*.ts"],
    languageOptions: {
      globals: {
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly"
      }
    }
  }
];
