import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { AI_CHAT_INPUT_LIMIT, DEVELOPER_REVIEW_LIMIT } from "../shared/ai-chat";
import { createDeveloperReview, ReviewError, type ReviewSnapshot } from "./ai-developer-review";
import { createOpenCodeAgent, DeveloperChatError } from "./ai-opencode";

const sessionLifetime = 30 * 60_000;
const unlockBody = z.object({ passphrase: z.string().min(1).max(512) }).strict();
const developerBody = z.union([
  z.object({ content: z.string().trim().min(1).max(AI_CHAT_INPUT_LIMIT),
    mode: z.enum(["plan", "build"]).default("build") }).strict(),
  z.object({ action: z.literal("new") }).strict(),
  z.object({ action: z.literal("open"), thread: z.string().regex(/^ses_[a-zA-Z0-9]+$/) }).strict(),
  z.object({ action: z.literal("review") }).strict(),
  z.object({ action: z.literal("apply"), review: z.string().regex(/^[a-f0-9]{48}$/),
    paths: z.array(z.string().min(1).max(500)).min(1).max(DEVELOPER_REVIEW_LIMIT)
      .refine((paths) => new Set(paths).size === paths.length) }).strict(),
]);
type Access = { expiresAt: number; thread?: string; review?: ReviewSnapshot };
type Result = { status: number; body: object };

const success = (body: object): Result => ({ status: 200, body });
const failure = (status: number, error: string): Result => ({ status, body: { error } });

export function createDeveloperChat(options: {
  root: string;
  state?: string;
  apiKey?: string;
  model: string;
  passphrase?: string;
  protectedValues: string[];
}) {
  const { root, state, apiKey, model, passphrase, protectedValues } = options;
  const engine = state && apiKey ? createOpenCodeAgent({ root, state, apiKey, model, secrets: protectedValues }) : undefined;
  const review = state ? createDeveloperReview(root, state, protectedValues) : undefined;
  const passphraseHash = passphrase && createHash("sha256").update(passphrase).digest();
  const sessions = new Map<string, Access>();
  let pending = false;

  async function run(timeoutMs: number, operation: (signal: AbortSignal) => Promise<Result>) {
    if (pending) return failure(429, "developer_busy");
    pending = true;
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      return await operation(signal);
    } catch (error) {
      if (signal.aborted) return failure(504, "developer_timeout");
      if (error instanceof DeveloperChatError) return failure(error.status, error.code);
      if (error instanceof ReviewError) return { status: error.status, body: { error: error.code, path: error.path } };
      return failure(502, "developer_engine");
    } finally {
      pending = false;
    }
  }

  return {
    close: () => engine?.close(),
    async authenticate(body: unknown, token?: string) {
      if (token) {
        sessions.delete(token);
        return success({ locked: true });
      }
      if (!passphraseHash) return failure(503, "developer_unconfigured");
      const { data } = unlockBody.safeParse(body);
      if (!data || !timingSafeEqual(createHash("sha256").update(data.passphrase).digest(), passphraseHash)) {
        return failure(403, "developer_invalid_passphrase");
      }
      if (!engine) return failure(503, "developer_engine_unavailable");
      return run(45_000, async (signal) => {
        const now = Date.now();
        for (const [id, session] of sessions) {
          if (session.expiresAt <= now) sessions.delete(id);
        }
        if (sessions.size >= 16) return failure(429, "developer_busy");
        const threads = await engine.list(signal);
        const thread = threads[0]?.id;
        const messages = thread ? await engine.history(thread, signal) : [];
        const workspace = await engine.workspace();
        const id = randomBytes(32).toString("hex");
        sessions.set(id, { expiresAt: Date.now() + sessionLifetime, thread });
        return success({ token: id, workspace, model, threads, thread, messages });
      });
    },
    async request(body: unknown, token?: string) {
      const session = token && sessions.get(token);
      if (!session || session.expiresAt <= Date.now()) {
        if (token) sessions.delete(token);
        return failure(401, "developer_locked");
      }
      const { data } = developerBody.safeParse(body);
      if (!data) return failure(400, "invalid_input");
      if (!engine) return failure(503, "developer_engine_unavailable");
      if ("content" in data && [...protectedValues, token].some((value) => value && data.content.includes(value))) {
        return failure(400, "credential_in_chat");
      }

      return run("content" in data ? 600_000 : 45_000, async (signal) => {
        session.expiresAt = Date.now() + sessionLifetime;
        if ("action" in data) {
          if (data.action === "review" || data.action === "apply") {
            if (!review) return failure(503, "review_unavailable");
            try {
              if (data.action === "review") {
                session.review = await review.preview(signal);
                return success(session.review.review);
              }
              const snapshot = session.review;
              if (snapshot?.review.id !== data.review || data.paths.some((path) => !snapshot.fingerprints.has(path))) {
                return failure(409, "review_stale");
              }
              session.review = undefined;
              return success(await review.apply(snapshot, data.paths, signal));
            } catch (error) {
              if (signal.aborted || error instanceof ReviewError) throw error;
              return failure(502, "review_unavailable");
            }
          }
          if (data.action === "new") {
            session.thread = (await engine.create(signal)).id;
          } else {
            const threads = await engine.list(signal);
            if (!threads.some((thread) => thread.id === data.thread)) return failure(404, "developer_thread");
            session.thread = data.thread;
          }
          const messages = data.action === "open" ? await engine.history(session.thread, signal) : [];
          return success({ thread: session.thread, threads: await engine.list(signal), messages });
        }
        session.thread ??= (await engine.create(signal)).id;
        const result = await engine.ask(session.thread, data.content, data.mode, signal);
        return success({ ...result, thread: session.thread, threads: await engine.list(signal) });
      });
    },
  };
}
