import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// IMPORTANTE: cambia "finanzas-app" por el nombre real de tu repo de GitHub
export default defineConfig({
  base: "/finanzas-app/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Finanzas",
        short_name: "Finanzas",
        description: "App de finanzas personales",
        theme_color: "#1c1917",
        background_color: "#fafaf9",
        display: "standalone",
        start_url: "/finanzas-app/",
        scope: "/finanzas-app/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" }
        ]
      }
    })
  ]
});
