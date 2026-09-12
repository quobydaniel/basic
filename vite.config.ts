// Explicit plugin chain (replaces the Lovable meta-config wrapper).
// Load order matters: tanstackStart must come before viteReact.
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts
      // (our SSR error wrapper, just like the Lovable export).
      server: { entry: "src/server" },
    }),
    viteReact(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  // Plain HTTP: the embedded browser rejects self-signed certs
  // (ERR_CERT_AUTHORITY_INVALID). The .dev-cert/ directory and the https
  // block below are kept for when HTTPS is wanted again — set https:
  // loadDevCert() and point the browser at https://localhost:3000.
  server: { port: 3000 },
});
