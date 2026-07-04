import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 当被 server/index.ts 以 middlewareMode 调用时读取此配置
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
  },
});
