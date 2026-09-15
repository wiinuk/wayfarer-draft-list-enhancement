import { defineConfig } from "vite";
import { userscriptReload } from "./src/vite-plugin-userscript-reload.ts";

export default defineConfig({
  plugins: [userscriptReload()],
});
