import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import monacoEditorModule from "vite-plugin-monaco-editor";

const monacoEditorPlugin = monacoEditorModule.default ?? monacoEditorModule;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), monacoEditorPlugin({})],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/chat": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/run": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/format": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
