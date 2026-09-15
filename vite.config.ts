import os from "node:os";
import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";

function getDevelopmentHost() {
  const configuredHost = process.env.WAYFARER_DEV_HOST;
  if (configuredHost) return configuredHost;

  const addresses = Object.values(os.networkInterfaces()).flatMap(
    (networkAddresses) => networkAddresses ?? [],
  );
  const localAddress = addresses.find(
    (address) => address.family === "IPv4" && !address.internal,
  );

  return localAddress?.address ?? "127.0.0.1";
}

export default defineConfig({
  server: {
    host: getDevelopmentHost(),
    cors: true,
    headers: {
      "Access-Control-Allow-Private-Network": "true",
    },
  },
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
