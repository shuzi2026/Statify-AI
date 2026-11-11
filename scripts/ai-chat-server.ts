import type { Plugin } from "vite";
import {
  AI_CHAT_DEVELOPER_PATH,
  AI_CHAT_DEVELOPER_SESSION_PATH,
  AI_CHAT_PATH,
} from "../shared/ai-chat";
import { createDeveloperChat } from "./ai-developer-chat";
import { SHOPPING_DEMO_PATH } from "../shared/shopping-demo";
import { createShoppingDemo } from "./shopping-demo";
import type { SandboxCredentials } from "./shopping-paypal";
import { json, readJson, sendChat } from "./http-json";
import { createUserChat, defaultAiModel } from "./user-chat";

export function aiChatPlugin({
  apiKey, model = defaultAiModel, channel3ApiKey, paypalCredentials, developerPassphrase, developerState, developerApiKey = apiKey, developerModel = model, walkSkill,
}: {
  apiKey?: string;
  model?: string;
  channel3ApiKey?: string;
  paypalCredentials?: SandboxCredentials;
  developerPassphrase?: string;
  developerState?: string;
  developerApiKey?: string;
  developerModel?: string;
  walkSkill?: string;
}): Plugin {
  return {
    name: "statify-local-ai-chat",
    apply: "serve",
    configureServer(server) {
      const protectedValues = [...new Set([apiKey, channel3ApiKey, paypalCredentials?.secret, developerApiKey, developerPassphrase].filter((value): value is string => !!value))];
      const shopping = channel3ApiKey && createShoppingDemo(channel3ApiKey, paypalCredentials);
      const userChat = createUserChat({ apiKey, model, channel3ApiKey, protectedValues, walkSkill,
        signOffer: shopping ? shopping.signOffer : undefined });
      const developer = createDeveloperChat({
        root: server.config.root, state: developerState, apiKey: developerApiKey,
        model: developerModel, passphrase: developerPassphrase, protectedValues,
      });
      server.httpServer?.once("close", developer.close);
      server.middlewares.use(async (request, response, next) => {
        const path = request.url;
        if (path !== AI_CHAT_PATH && path !== AI_CHAT_DEVELOPER_PATH && path !== AI_CHAT_DEVELOPER_SESSION_PATH && path !== SHOPPING_DEMO_PATH) return next();

        const address = server.httpServer?.address();
        const port = typeof address === "object" ? address?.port : undefined;
        const host = request.headers.host;
        const origin = request.headers.origin;
        if (
          request.socket.remoteAddress !== "127.0.0.1" ||
          !port ||
          (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) ||
          (origin && origin !== `http://${host}`)
        ) return json(response, 403, { error: "forbidden" });

        if (path === AI_CHAT_PATH && request.method === "GET") {
          return json(response, 200, { configured: !!apiKey, ...(apiKey ? { model } : {}), developerConfigured: !!(developerState && developerApiKey && developerPassphrase) });
        }
        if (request.method !== "POST") return json(response, 405, { error: "method" });
        if (origin !== `http://${host}`) return json(response, 403, { error: "forbidden" });
        if (request.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") {
          return json(response, 415, { error: "content_type" });
        }

        const body = await readJson(request).catch(() => undefined);
        if (path === SHOPPING_DEMO_PATH) {
          if (!shopping) return json(response, 503, { error: "shopping_unconfigured" });
          const result = await shopping(body, origin);
          return json(response, result.status, result.body);
        }
        if (path !== AI_CHAT_PATH) {
          const token = request.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
          const result = await (path === AI_CHAT_DEVELOPER_SESSION_PATH
            ? developer.authenticate(body, token) : developer.request(body, token));
          return json(response, result.status, result.body);
        }

        await sendChat(request, response, (progress, signal) => userChat(body, "local", progress, signal));
      });
    },
  };
}
