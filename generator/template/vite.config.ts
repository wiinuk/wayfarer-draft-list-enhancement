import { defineConfig } from "vite";
import { userscript } from "./src/vite-plugin-userscript.ts";

export default defineConfig({
  plugins: [
    userscript({
      entry: "./src/userscript.user.ts",
      output: ".",
    }),
  ],
});
