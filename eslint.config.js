import js from "@eslint/js";
import globals from "globals";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const clientFiles = ["client/src/**/*.{ts,tsx}"];
const serverFiles = ["server/**/*.ts", "shared/**/*.ts"];
const jsxA11yRecommendedWarnings = Object.fromEntries(
  Object.keys(jsxA11y.flatConfigs.recommended.rules).map((ruleName) => [
    ruleName,
    "warn",
  ]),
);

export default tseslint.config(
  {
    ignores: [
      "coverage/**",
      "dist/**",
      "dist-local/**",
      "node_modules/**",
      "output/**",
      "artifacts/**",
    ],
  },
  {
    files: clientFiles,
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      ...reactHooks.configs["flat/recommended"],
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2024,
      },
    },
    rules: {
      ...jsxA11yRecommendedWarnings,
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
          varsIgnorePattern: "^_",
        },
      ],
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/label-has-for": "off",
      "jsx-a11y/no-static-element-interactions": "error",
      "no-extra-boolean-cast": "warn",
      "no-irregular-whitespace": "warn",
      "no-unsafe-finally": "warn",
      "no-unused-vars": "off",
      "no-useless-escape": "warn",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: serverFiles,
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2024,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
          varsIgnorePattern: "^_",
        },
      ],
      "no-extra-boolean-cast": "warn",
      "no-irregular-whitespace": "warn",
      "no-unsafe-finally": "warn",
      "no-unused-vars": "off",
      "no-useless-escape": "warn",
    },
  },
);
