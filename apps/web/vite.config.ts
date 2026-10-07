import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// O painel fala com a API pelo mesmo endereço (/api), então o cookie de sessão é de mesma origem.
// Em desenvolvimento o Vite encaminha /api para a API local; em produção o proxy reverso faz esse papel.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Regras compartilhadas com a API, lidas direto do código-fonte.
      "@velqyro/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // Chave com "^" é expressão regular: só o que começa com /api/ vai para a API.
      // Com a chave "/api", a página /api-webhooks do painel também era encaminhada ao recarregar.
      "^/api/": { target: process.env.VITE_API_PROXY ?? "http://localhost:3333", changeOrigin: false },
    },
  },
});
