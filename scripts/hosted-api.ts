import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { AI_CHAT_PATH, GUEST_TEST_ORIGIN, GUEST_TEST_RESET_PATH } from "../shared/ai-chat";
import { SHOPPING_DEMO_PATH } from "../shared/shopping-demo";
import { demoToken } from "./demo-token";
import { json, readJson, sendChat } from "./http-json";
import { createShoppingDemo } from "./shopping-demo";
import type { SandboxCredentials } from "./shopping-paypal";
import { createUserChat, defaultAiModel } from "./user-chat";
import type { VisitorMemory } from "./visitor-memory";

const visitorAge = 7 * 24 * 60 * 60;
const visitorSchema = z.object({ id: z.uuid(), expires: z.number().int() });

export function createHostedApi({ origin, signingKey, apiKey, channel3ApiKey, paypal, model = defaultAiModel,
  dailyVisitorLimit = 30, guestTest = false, walkSkill, memory }: {
  origin: URL;
  signingKey: string;
  apiKey: string;
  channel3ApiKey: string;
  paypal: SandboxCredentials;
  model?: string;
  dailyVisitorLimit?: number;
  guestTest?: boolean;
  walkSkill?: string;
  memory?: VisitorMemory;
}) {
  if (guestTest && origin.origin !== GUEST_TEST_ORIGIN) throw new Error("Invalid guest test origin");
  const visitorCookie = guestTest ? "statify_guest_test_visitor" : "statify_demo_visitor";
  const visitors = demoToken(signingKey, guestTest ? "guest-test-visitor" : "visitor", visitorSchema);
  const shopping = createShoppingDemo(channel3ApiKey, paypal, signingKey);
  const chat = createUserChat({ apiKey, model, channel3ApiKey, dailyVisitorLimit, walkSkill, memory, signOffer: shopping.signOffer,
    protectedValues: [apiKey, channel3ApiKey, paypal.secret, signingKey] });
  const requestWindows = {
    [AI_CHAT_PATH]: { ends: 0, count: 0 },
    [SHOPPING_DEMO_PATH]: { ends: 0, count: 0 },
  };

  function readVisitor(request: IncomingMessage) {
    const cookie = request.headers.cookie?.split(/;\s*/).find((part) => part.startsWith(`${visitorCookie}=`));
    const visitor = cookie && visitors.open(cookie.slice(visitorCookie.length + 1));
    return visitor && visitor.expires > Date.now() ? visitor : undefined;
  }

  function ensureVisitor(request: IncomingMessage, response: ServerResponse) {
    const visitor = readVisitor(request);
    if (visitor && visitor.expires - Date.now() > 2 * 24 * 60 * 60_000) return;
    const token = visitors.seal({ id: visitor?.id ?? randomUUID(), expires: Date.now() + visitorAge * 1000 });
    const secure = origin.protocol === "https:" ? "; Secure" : "";
    response.setHeader("Set-Cookie", `${visitorCookie}=${token}; Path=/; Max-Age=${visitorAge}; HttpOnly; SameSite=Lax${secure}`);
  }

  async function handle(request: IncomingMessage, response: ServerResponse) {
    const path = request.url;
    if (guestTest && path === GUEST_TEST_RESET_PATH) {
      if (request.method !== "POST" || request.headers.origin !== origin.origin) {
        json(response, 403, { error: "forbidden" });
      } else {
        const visitor = readVisitor(request);
        if (visitor && !await chat.clearVisitorMemory(visitor.id)) {
          json(response, 429, { error: "busy" });
          return true;
        }
        response.setHeader("Set-Cookie", `${visitorCookie}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
        json(response, 200, { reset: true });
      }
      return true;
    }
    if (path !== AI_CHAT_PATH && path !== SHOPPING_DEMO_PATH) return false;
    const method = request.method;
    const from = request.headers.origin;
    if ((from && from !== origin.origin) || (method === "POST" && from !== origin.origin)) {
      json(response, 403, { error: "forbidden" });
      return true;
    }
    if (path === AI_CHAT_PATH && method === "GET") {
      ensureVisitor(request, response);
      json(response, 200, { configured: true, model, developerConfigured: false, ...(memory && { memoryEnabled: true }) });
      return true;
    }
    if (method !== "POST") {
      json(response, 405, { error: "method" });
      return true;
    }
    const visitor = readVisitor(request);
    if (!visitor) {
      json(response, 403, { error: "session_required" });
      return true;
    }
    if (request.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") {
      json(response, 415, { error: "content_type" });
      return true;
    }
    const now = Date.now();
    const window = requestWindows[path];
    if (now >= window.ends) {
      window.count = 0;
      window.ends = now + 60_000;
    }
    if (++window.count > 60) {
      response.setHeader("Retry-After", String(Math.ceil((window.ends - now) / 1_000)));
      json(response, 429, { error: "busy" });
      return true;
    }
    const body = await readJson(request).catch(() => undefined);
    if (path === AI_CHAT_PATH) {
      await sendChat(request, response, (progress, signal) => chat(body, visitor.id, progress, signal));
    } else {
      const result = await shopping(body, origin.origin, visitor.id);
      json(response, result.status, result.body);
    }
    return true;
  }

  return { ensureVisitor, handle };
}
