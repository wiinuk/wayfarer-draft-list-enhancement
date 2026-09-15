//spell-checker: words userscript
import { defineConfig } from "vite";
import { userscript } from "./src/vite-plugin-userscript.ts";

export default defineConfig({
  plugins: [
    userscript({
      entry: "./src/wayfarer-draft-list-enhancement.user.ts",
      output: ".",
    }),
  ],
});
