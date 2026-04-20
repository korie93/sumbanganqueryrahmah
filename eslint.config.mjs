import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import globals from "globals";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import { auditedAccessibleNameRule } from "./scripts/eslint-rules/audited-accessible-name-rule.mjs";

const tsconfigRootDir = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  {
    ignores: [
      "coverage/**",
      "dist-local/**",
      "node_modules/**",
      "vendor/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx,mts,cts}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2024,
        ...globals.node,
      },
    },
    rules: {
      "no-constant-condition": [
        "error",
        {
          checkLoops: false,
        },
      ],
      "no-control-regex": "off",
      "no-empty": "off",
      "no-eval": "error",
      "no-extra-boolean-cast": "off",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",
      "no-unsafe-finally": "off",
      "no-unsafe-optional-chaining": "error",
      "no-useless-escape": "off",
      "prefer-const": "off",
    },
  },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parserOptions: {
        // lint-staged can pass root config files such as vite.config.ts directly to ESLint.
        // Let the parser fall back to the default project for those narrow config entrypoints
        // instead of forcing them into the main application tsconfig include set.
        projectService: {
          allowDefaultProject: ["*.config.ts"],
        },
        tsconfigRootDir,
      },
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: {
            attributes: false,
            properties: false,
            returns: false,
            variables: false,
          },
        },
      ],
      "@typescript-eslint/no-unsafe-function-type": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["client/src/**/*.{ts,tsx}"],
    plugins: {
      "sqr-a11y": {
        rules: {
          "audited-accessible-name": auditedAccessibleNameRule,
        },
      },
      "jsx-a11y": jsxA11y,
      "react-hooks": reactHooks,
    },
    settings: {
      "jsx-a11y": {
        components: {
          Button: "button",
          FormLabel: "label",
          Label: "label",
        },
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "jsx-a11y/alt-text": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/control-has-associated-label": [
        "error",
        {
          controlComponents: ["Button"],
          ignoreElements: [],
          ignoreRoles: [],
        },
      ],
      "jsx-a11y/interactive-supports-focus": "error",
      "jsx-a11y/label-has-associated-control": [
        "error",
        {
          assert: "either",
          controlComponents: ["Input"],
          depth: 3,
          labelComponents: ["FormLabel", "Label"],
        },
      ],
      "jsx-a11y/no-access-key": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "sqr-a11y/audited-accessible-name": "error",
    },
  },
  {
    files: ["scripts/**/*.{ts,mts,cts}"],
    languageOptions: {
      parserOptions: {
        projectService: false,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",
    },
  },
  {
    files: [
      "**/*.test.{js,mjs,cjs,ts,tsx,mts,cts}",
      "**/tests/**/*.{js,mjs,cjs,ts,tsx,mts,cts}",
    ],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",
    },
  },
);
