import eslint from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.next/**",
      "**/coverage/**",
      "next-env.d.ts",
    ],
  },

  // Base: ESLint recommended + typescript-eslint strict
  eslint.configs.recommended,
  ...tseslint.configs.strict,

  // Global rule overrides
  {
    rules: {
      // Allow unused vars with _ prefix
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Allow non-null assertions (common in existing codebase)
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },

  // React hooks + Next.js rules
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooksPlugin,
      "@next/next": nextPlugin,
    },
    rules: {
      ...reactHooksPlugin.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "@next/next/no-html-link-for-pages": ["error", "src/app"],
      // Allow setState in effects (common pattern for route-based state reset)
      "react-hooks/set-state-in-effect": "off",
    },
  },

  // Test files: relax some rules
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/tests/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-require-imports": "off",
      "no-constant-binary-expression": "off",
    },
  },
);
