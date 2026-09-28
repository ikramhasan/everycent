import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiTarget = process.env.API_PROXY_TARGET ?? "http://localhost:3000";

export default defineConfig({
  // Router plugin must come before the React plugin.
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // @everycent/ui's sonner.tsx imports `useTheme` from "next-themes" directly;
      // redirect that (and any of our own leftover imports) to our script-tag-free
      // shim so both stay on the same theme state. See src/lib/theme.tsx for why.
      "next-themes": fileURLToPath(new URL("./src/lib/theme.tsx", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin in dev: the browser only ever talks to :5173, so auth cookies just work.
    proxy: { "/v1": apiTarget, "/api": apiTarget },
  },
});
