import { defineConfig } from "vite";
import { resolve } from "path";
import dts from "vite-plugin-dts";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "TonPaymentGateway",
      fileName: (format) => `index.${format}.js`,
    },
    rollupOptions: {
      external: ["@tonconnect/ui"],
      output: {
        globals: {
          "@tonconnect/ui": "TonConnectUI"
        }
      }
    }
  },
  plugins: [dts()]
});
