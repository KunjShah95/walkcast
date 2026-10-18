import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["node_modules", "dist", "**/dist", "apps/desktop/src-tauri/target", "apps/desktop/src-tauri/sidecar", "apps/desktop/src-tauri/gen", "results", "runs", "fixtures", "recordings", ".lab", "docs/architecture/preview", "apps/mobile/android", "apps/mobile/ios", "apps/mobile/node_modules"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...globals.node, ...globals.browser } },
    rules: {
      // The codebase uses `any` deliberately at a few untyped JSON boundaries.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none", destructuredArrayIgnorePattern: "^_" }],
    },
  },
);
