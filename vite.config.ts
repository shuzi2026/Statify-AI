// @ts-expect-error Existing source-message instrumentation is JavaScript.
import { internationalTextPlugin } from "./scripts/i18n-plugin.mjs";
// @ts-expect-error Existing CSS compatibility helper is JavaScript.
import { createWebViewCompatibility } from "./scripts/webview-compat.mjs";
// @ts-expect-error Development-only layout middleware is JavaScript.
import { uiLayoutPlugin } from "./scripts/ui-layout-server.mjs";
import { defineConfig, loadEnv, type Plugin, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import { aiChatPlugin } from "./scripts/ai-chat-server";
import { developerStatePath } from "./scripts/ai-developer-workspace";
// @ts-expect-error Local asset pipeline is JavaScript.
import { runtimeAssetsPlugin } from "./scripts/assets.mjs";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { version as appVersion } from "./package.json";
// @ts-expect-error Shared Node build metadata generator.
import { createBuildIdentity, buildIdentityPlugin } from "./scripts/build-identity.mjs";

const compatibility = createWebViewCompatibility(
  fileURLToPath(new URL(".", import.meta.url)),
);
// This local preview must not start or proxy regional account services.
const localAccountBoundary: Plugin = {
  name: "statify-ai-local-account-boundary",
  configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.url === "/__statify_health") {
        response.setHeader("Content-Type", "application/json");
        response.end(
          JSON.stringify({
            project: "statify-ai-local",
            root: fileURLToPath(new URL(".", import.meta.url)),
            version: appVersion,
            port: server.config.server.port,
          }),
        );
        return;
      }
      if (
        !/^\/(?:cn-test\/api|global-(?:test|live)\/api|api\/v1)(?:\/|\?|$)/.test(
          request.url || "",
        )
      )
        return next();
      response.statusCode = 503;
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          title: "Local preview: account service is not connected.",
        }),
      );
    });
  },
};
export default defineConfig(({ command, mode }): UserConfig => {
  const hackathon = mode === "ai-hackathon";
  const hosted = command === "build" && hackathon;
  const devRegion = command === "serve" ? (mode === "ai-global" || hackathon ? "global" : "cn") : undefined;
  const appRegion = hosted ? "global" : devRegion;
  const storageScope = hackathon ? "hackathon" : devRegion;
  const aiEnv = devRegion ? loadEnv(hackathon ? "ai-global" : mode, process.cwd(), "STATIFY_OPENAI_") : {};
  const shoppingEnv = devRegion === "global"
    ? loadEnv("paypal-channel3", process.cwd(), ["CHANNEL3_API_KEY", "PAYPAL_SANDBOX_"])
    : {};
  const paypalClientId = shoppingEnv.PAYPAL_SANDBOX_CLIENT_ID?.trim();
  const paypalSecret = shoppingEnv.PAYPAL_SANDBOX_CLIENT_SECRET?.trim();
  const aiRegion = devRegion?.toUpperCase();
  const developerEnv = devRegion && !hackathon
    ? loadEnv(`statify-developer-${devRegion}`, process.cwd(), "STATIFY_DEV_CHAT_")
    : {};
  return {
    plugins: [
      buildIdentityPlugin(createBuildIdentity({ root: fileURLToPath(new URL(".", import.meta.url)),
        region: appRegion ?? (process.env.VITE_STATIFY_REGION === "global" ? "global" : "cn"),
        mode: command === "serve" ? "development" : "production" })),
      compatibility.vitePlugin,
      internationalTextPlugin(appRegion),
      react(),
      runtimeAssetsPlugin(),
      uiLayoutPlugin(),
      aiRegion && devRegion && aiChatPlugin({
        walkSkill: readFileSync(new URL("./skills/walk-check-in/SKILL.md", import.meta.url), "utf8"),
        apiKey: aiEnv[`STATIFY_OPENAI_API_KEY_${aiRegion}`]?.trim(),
        model: aiEnv[`STATIFY_OPENAI_MODEL_${aiRegion}`]?.trim() || undefined,
        channel3ApiKey: shoppingEnv.CHANNEL3_API_KEY?.trim(),
        paypalCredentials: paypalClientId && paypalSecret ? { clientId: paypalClientId, secret: paypalSecret } : undefined,
        developerPassphrase: developerEnv[`STATIFY_DEV_CHAT_PASSPHRASE_${aiRegion}`]?.trim(),
        developerApiKey: developerEnv[`STATIFY_DEV_CHAT_OPENAI_API_KEY_${aiRegion}`]?.trim() || undefined,
        developerModel: developerEnv[`STATIFY_DEV_CHAT_OPENAI_MODEL_${aiRegion}`]?.trim() || undefined,
        developerState: hackathon ? undefined : developerStatePath(fileURLToPath(new URL(".", import.meta.url)), devRegion),
      }),
      localAccountBoundary,
    ],
    css: { postcss: { plugins: [compatibility.cssPlugin] } },
    define: appRegion && {
      "import.meta.env.VITE_STATIFY_REGION": JSON.stringify(appRegion),
      "import.meta.env.VITE_STATIFY_PAYMENT_ENV": JSON.stringify("sandbox"),
      "import.meta.env.VITE_STATIFY_ACCOUNT_BACKEND": JSON.stringify(hackathon ? "none" : appRegion === "cn" ? "cn-postgres" : "global-postgres"),
      "import.meta.env.VITE_STATIFY_DATABASE_NAME": JSON.stringify("Statify-AI-" + storageScope + "-web"),
      "import.meta.env.VITE_STATIFY_STORAGE_PREFIX": JSON.stringify("statify-ai-" + storageScope + ":"),
      ...(command === "serve" ? { "import.meta.env.STATIFY_LOCAL_AI_GUEST": JSON.stringify("1") } : {}),
      ...(hosted ? {
        "import.meta.env.STATIFY_HOSTED_DEMO": "true",
        "import.meta.env.VITE_STATIFY_HARDENED": JSON.stringify("1"),
      } : {}),
    },
    cacheDir: storageScope ? "node_modules/.vite-ai-" + storageScope : undefined,
    base: "./",
    publicDir: command === "build" || process.env.VITE_STATIFY_HARDENED === "1" ? false : "public",
    optimizeDeps: {
      include: ["@capacitor/core", "@capacitor/filesystem", "@capacitor/share"],
    },
    build: {
      target: "chrome74",
      outDir: hosted ? "output/build/hackathon/web" :
        process.env.STATIFY_WEB_DIR ||
        (process.env.VITE_STATIFY_HARDENED === "1"
          ? "output/build/beta-prep/web"
          : "output/build/app"),
      emptyOutDir: true,
      rollupOptions: {
        input:
          hosted || process.env.VITE_STATIFY_HARDENED === "1"
            ? { main: "index.html" }
            : { main: "index.html", preview: "preview.html" },
      },
    },
    server: {
      host: "127.0.0.1",
      port: hackathon ? 15287 : devRegion === "global" ? 15286 : 15284,
      strictPort: true,
      watch: {
        ignored: [
          "**/public/whitebox/defaults.json",
          "**/.ui-layout/**",
          "**/tests/**",
          "**/output/**",
          "**/docs/**",
          "**/assets/截图/**",
          "**/assets/未分类/**",
          "**/assets/brand/**",
          "**/tools/**",
        ],
      },
    },
  };
});
