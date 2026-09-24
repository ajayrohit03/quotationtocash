import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
      // Next.js resolves this to its own no-op empty.js in a real server
      // component (via the "react-server" export condition) — outside
      // Next, its default export just throws, so any test importing a
      // file that has "import 'server-only'" at the top (e.g.
      // lib/pdf/document-pdf.tsx, lib/pdf/render.tsx) would otherwise
      // fail here with an unrelated-looking error. Alias straight to
      // that same empty.js so tests see the same no-op Next gives it.
      "server-only": path.resolve(
        import.meta.dirname,
        "node_modules/server-only/empty.js",
      ),
    },
  },
  test: {
    environment: "node",
  },
});
