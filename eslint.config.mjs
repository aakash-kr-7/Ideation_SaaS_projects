import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "node:url";
import path from "node:path";

const directory = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: directory });

const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "coverage/**", "next-env.d.ts", "tsconfig.tsbuildinfo", "supabase/functions/_shared/database.types.ts", "supabase/functions/_shared/types.ts"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "react/no-unescaped-entities": "off",
      "@next/next/no-page-custom-font": "off",
      "@next/next/no-img-element": "off",
      "import/no-anonymous-default-export": "off",
    },
  },
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
  {
    // Edge pipeline rows are dynamically shaped PostgREST/provider payloads and
    // are checked by Zod and integrity guards at their trust boundaries.
    files: ["supabase/functions/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    files: ["scripts/**/*.{js,cjs}"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
];

export default eslintConfig;
