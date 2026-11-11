import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { GUEST_TEST_ORIGIN, GUEST_TEST_PORT } from "../shared/ai-chat";
import { createHostedApi } from "./hosted-api";
import { json } from "./http-json";
import { createVisitorMemory, guestMemorySigningKey } from "./visitor-memory";
import walkSkill from "../skills/walk-check-in/SKILL.md?raw";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const guestTest = process.argv.includes("--guest-test");
const origin = new URL(guestTest ? GUEST_TEST_ORIGIN : required("STATIFY_HOSTED_ORIGIN"));
const local = ["127.0.0.1", "localhost"].includes(origin.hostname);
if ((origin.protocol !== "https:" && !(local && origin.protocol === "http:")) ||
    origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
  throw new Error("STATIFY_HOSTED_ORIGIN must be the HTTPS site origin (HTTP allowed for local testing)");
}
const guestMemoryDirectory = resolve("output/guest-memory");
const memoryDirectory = guestTest ? guestMemoryDirectory : process.env.STATIFY_MEMORY_DIR?.trim();
const signingKey = guestTest ? await guestMemorySigningKey(guestMemoryDirectory) : required("STATIFY_DEMO_SIGNING_KEY");
if (!/^[A-Za-z0-9_-]{43,}$/.test(signingKey)) throw new Error("STATIFY_DEMO_SIGNING_KEY must be a stable random base64url key of at least 32 bytes");
const port = guestTest ? GUEST_TEST_PORT : Number(process.env.STATIFY_HOSTED_PORT ?? 15288);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid STATIFY_HOSTED_PORT");
if (!guestTest && (port === GUEST_TEST_PORT || origin.origin === GUEST_TEST_ORIGIN)) throw new Error("Port reserved for guest testing");
const dailyVisitorLimit = Number(process.env.STATIFY_AI_DAILY_VISITOR_LIMIT ?? 30);
if (!Number.isSafeInteger(dailyVisitorLimit) || dailyVisitorLimit < 1) throw new Error("Invalid STATIFY_AI_DAILY_VISITOR_LIMIT");

const web = fileURLToPath(new URL("../web/", import.meta.url));
if (!(await stat(resolve(web, "index.html"))).isFile()) throw new Error("Build the hosted demo first");
const apiKey = process.env.STATIFY_OPENAI_API_KEY_HACKATHON?.trim() ||
  required(local ? "STATIFY_OPENAI_API_KEY_GLOBAL" : "STATIFY_OPENAI_API_KEY_HACKATHON");
const memory = memoryDirectory ? await createVisitorMemory(resolve(memoryDirectory), apiKey) : undefined;
const demo = createHostedApi({
  origin, signingKey, guestTest, dailyVisitorLimit, walkSkill, apiKey, memory,
  model: process.env.STATIFY_OPENAI_MODEL_GLOBAL?.trim() || undefined,
  channel3ApiKey: required("CHANNEL3_API_KEY"),
  paypal: { clientId: required("PAYPAL_SANDBOX_CLIENT_ID"), secret: required("PAYPAL_SANDBOX_CLIENT_SECRET") },
});

const mime = new Map(Object.entries({
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".webp": "image/webp", ".avif": "image/avif", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".mp3": "audio/mpeg", ".wav": "audio/wav",
}));

const server = createServer({ requestTimeout: 30_000, headersTimeout: 15_000 }, async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");
  response.setHeader("X-Frame-Options", "DENY");
  try {
    if (request.headers.host !== origin.host) return json(response, 403, { error: "forbidden" });
    if (await demo.handle(request, response)) return;
    if (request.method !== "GET" && request.method !== "HEAD") return json(response, 404, { error: "not_found" });
    if (request.url === "/__statify_health") return json(response, 200, { ready: true });

    const path = decodeURIComponent((request.url ?? "").split("?")[0]);
    if (!path.startsWith("/") || /[\\:\x00-\x1f]/.test(path) || path.split("/").some((part) => part.startsWith("."))) {
      return json(response, 404, { error: "not_found" });
    }
    const document = path === "/" || path === "/index.html";
    const file = resolve(web, `.${document ? "/index.html" : path}`);
    const type = mime.get(extname(file).toLowerCase());
    if (!type || !file.startsWith(resolve(web) + sep)) return json(response, 404, { error: "not_found" });
    const details = await stat(file).catch(() => undefined);
    if (!details?.isFile()) return json(response, 404, { error: "not_found" });
    if (document && request.method === "GET") demo.ensureVisitor(request, response);
    response.writeHead(200, {
      "Content-Type": type, "Content-Length": details.size,
      "Cache-Control": document ? "no-store" : "public, max-age=3600",
    });
    if (request.method === "HEAD") response.end();
    else await pipeline(createReadStream(file), response);
  } catch {
    if (response.headersSent) response.destroy();
    else json(response, 500, { error: "server_error" });
  }
});

server.listen(port, "127.0.0.1", () => console.log(`Statify demo listening on 127.0.0.1:${port} for ${origin.origin}`));
