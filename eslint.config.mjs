import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Seller and customer code stay separate; share through src/features/shared or src/lib.
  {
    files: ["src/features/seller/**", "src/app/(seller)/**"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{ group: ["@/features/customer/*", "**/features/customer/*"], message: "Seller code must not import customer code. Move shared code to @/features/shared." }],
      }],
    },
  },
  {
    files: ["src/features/customer/**", "src/app/(customer)/**"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{ group: ["@/features/seller/*", "**/features/seller/*"], message: "Customer code must not import seller code. Move shared code to @/features/shared." }],
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
