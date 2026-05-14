import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import monacoEditorModule from "vite-plugin-monaco-editor";

const monacoEditorPlugin = monacoEditorModule.default ?? monacoEditorModule;

export default defineConfig({
  plugins: [react(), monacoEditorPlugin({})],
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
    },
  },
});
