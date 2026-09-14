import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";

export default defineConfig({
  plugins: [
    monkey({
      entry: "src/main.ts",
      userscript: {
        name: "Wayfarer Draft List Enhancement",
        namespace: "http://tampermonkey.net/",
        version: "1.6.0",
        description:
          "Sort Niantic Wayfarer drafts using precise coordinates from API response",
        match: ["https://wayfarer.scopely.com/*"],
        grant: "none",
      },
    }),
  ],
});
