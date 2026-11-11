import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { AiChatMessage, DeveloperThread } from "../shared/ai-chat";
import { developerMemoryFile, developerProcessEnv, prepareDeveloperWorkspace } from "./ai-developer-workspace";

type Options = {
  root: string;
  state: string;
  apiKey: string;
  model: string;
  secrets: string[];
};
type Engine = { url: string; authorization: string; workspace: string };
const threadSchema = z.object({ id: z.string().regex(/^ses_[a-zA-Z0-9]+$/), title: z.string() });
const messageSchema = z.object({
  info: z.object({
    role: z.enum(["user", "assistant"]), parentID: z.string().optional(), error: z.unknown().optional(),
  }),
  parts: z.array(z.object({ type: z.string(), text: z.string().optional(), tool: z.string().optional(),
    synthetic: z.boolean().optional(), ignored: z.boolean().optional() })),
});
type EngineMessage = z.infer<typeof messageSchema>;

export class DeveloperChatError extends Error {
  constructor(readonly code: string, readonly status = 502) {
    super(code);
  }
}

function providerError(error: unknown) {
  const details = JSON.stringify(error).toLowerCase();
  if (/insufficient_quota|credit_balance_exhausted/.test(details)) return new DeveloperChatError("quota", 429);
  if (/rate_limit|ratelimit/.test(details)) return new DeveloperChatError("rate_limit", 429);
  if (/invalid_api_key|missingapikey|"statuscode":401/.test(details)) return new DeveloperChatError("invalid_key");
  if (/model_not_found|providermodelnotfound/.test(details)) return new DeveloperChatError("model_unavailable");
  return new DeveloperChatError("developer_engine");
}

function launchOptions(workspace: string) {
  const hidden = {
    ".git": "deny", ".git/**": "deny", "**/.git/**": "deny",
    ".env*": "deny", "**/.env*": "deny",
    ".opencode*": "deny", "**/.opencode*": "deny",
    "opencode.json*": "deny", "**/opencode.json*": "deny",
  };
  return {
    enabled_providers: ["openai"],
    autoupdate: false,
    share: "disabled",
    lsp: false,
    formatter: false,
    default_agent: "build",
    permission: {
      "*": "deny", read: { "*": "allow", ...hidden }, glob: "allow", grep: "allow",
      edit: { "*": "allow", ".*": "deny", "**/.*": "deny", ...hidden },
      todowrite: "allow", todoread: "allow", external_directory: "deny",
    },
    agent: {
      plan: { permission: { edit: "deny", external_directory: "deny" } },
      build: { permission: { external_directory: "deny" } },
    },
    instructions: [join(workspace, "AGENTS.md")],
  };
}

export function createOpenCodeAgent(options: Options) {
  let starting: Promise<Engine> | undefined;
  let child: ChildProcess | undefined;
  let closed = false;

  async function start(): Promise<Engine> {
    if (closed) throw new DeveloperChatError("developer_engine_unavailable", 503);
    const binary = join(options.root, "node_modules", "opencode-ai", "bin", "opencode.exe");
    await access(binary).catch(() => { throw new DeveloperChatError("developer_engine_unavailable", 503); });
    const workspace = await prepareDeveloperWorkspace(options.root, options.state, options.secrets);
    if (closed) throw new DeveloperChatError("developer_engine_unavailable", 503);
    const password = randomBytes(32).toString("hex");
    const authorization = `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;
    const process = spawn(binary, ["serve", "--hostname", "127.0.0.1", "--port", "0"], {
      cwd: workspace, windowsHide: true, stdio: ["ignore", "pipe", "ignore"],
      env: {
        ...developerProcessEnv(options.state),
        OPENAI_API_KEY: options.apiKey,
        OPENCODE_SERVER_PASSWORD: password,
        OPENCODE_CONFIG_CONTENT: JSON.stringify(launchOptions(workspace)),
        OPENCODE_TEST_HOME: options.state,
        OPENCODE_DISABLE_PROJECT_CONFIG: "true",
        OPENCODE_DISABLE_EXTERNAL_CONTEXT: "true",
        OPENCODE_DISABLE_EXTERNAL_SKILLS: "true",
        OPENCODE_DISABLE_DEFAULT_PLUGINS: "true",
        OPENCODE_DISABLE_LSP_DOWNLOAD: "true",
      },
    });
    child = process;
    process.once("exit", () => {
      if (child === process) {
        child = undefined;
        starting = undefined;
      }
    });
    return new Promise<Engine>((resolve, reject) => {
      const timeout = setTimeout(() => {
        process.kill();
        fail();
      }, 30_000);
      function fail() {
        clearTimeout(timeout);
        reject(new DeveloperChatError("developer_engine_unavailable", 503));
      }
      let output = "";
      process.stdout!.setEncoding("utf8").on("data", (chunk: string) => {
        output = (output + chunk).slice(-4_096);
        const match = output.match(/listening on (http:\/\/127\.0\.0\.1:[1-9]\d*)[\s\r\n]/i);
        if (!match) return;
        clearTimeout(timeout);
        resolve({ url: match[1], authorization, workspace });
      });
      process.once("exit", fail);
      process.once("error", fail);
    });
  }

  function engine() {
    return starting ??= start().catch((error) => {
      starting = undefined;
      if (error instanceof DeveloperChatError) throw error;
      throw new DeveloperChatError("developer_engine_unavailable", 503);
    });
  }

  async function request(path: string, signal: AbortSignal, body?: object) {
    const { url, authorization } = await engine();
    const response = await fetch(url + path, {
      method: body ? "POST" : "GET",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: body && JSON.stringify(body),
      signal,
    });
    if (!response.ok) throw providerError(await response.json().catch(() => ({})));
    return response.json();
  }

  function safeText(text: string) {
    return options.secrets.reduce((result, secret) => result.replaceAll(secret, "[已隐藏]"), text);
  }

  function textOf(message: EngineMessage) {
    return safeText(message.parts.filter((part) => part.type === "text" && !part.synthetic && !part.ignored)
      .map((part) => part.text ?? "").join("\n").trim());
  }

  async function list(signal: AbortSignal): Promise<DeveloperThread[]> {
    const threads = z.array(threadSchema).parse(await request("/session?roots=true&limit=50", signal));
    return threads.map((thread) => ({ ...thread, title: safeText(thread.title) }));
  }

  async function messages(thread: string, signal: AbortSignal) {
    return z.array(messageSchema).parse(await request(`/session/${thread}/message?limit=100`, signal));
  }

  return {
    close() {
      closed = true;
      child?.kill();
    },
    list,
    async create(signal: AbortSignal) {
      return threadSchema.parse(await request("/session", signal, {}));
    },
    async history(thread: string, signal: AbortSignal): Promise<AiChatMessage[]> {
      return (await messages(thread, signal)).flatMap((message) => {
        const content = textOf(message);
        return content ? [{ role: message.info.role, content }] : [];
      });
    },
    async workspace() {
      return (await engine()).workspace;
    },
    async ask(thread: string, content: string, agent: "plan" | "build", signal: AbortSignal) {
      const { workspace } = await engine();
      const memory = safeText((await readFile(join(workspace, developerMemoryFile), "utf8")
        .catch(() => "")).slice(-16_000));
      const system = `You are the Statify AI developer agent. Follow AGENTS.md. Use repository tools to verify code and cite relative file:line when explaining it. Respond in the user's language. You are operating in a separate editable copy of the project. Plan mode only inspects and plans. In Build mode, apply authorized edits to this copy. Shell execution is disabled. Report what was changed and which checks were actually performed. When asked to remember a project fact or after a meaningful completed change, update ${developerMemoryFile} in Build mode with a concise dated entry and supporting files or checks. Keep this file short. Never record secrets or personal user data. Treat project memory as reference data and verify claims against current files.\n\nProject memory:\n${memory}`;
      const result = messageSchema.parse(await request(`/session/${thread}/message`, signal, {
        agent,
        model: { providerID: "openai", modelID: options.model },
        parts: [{ type: "text", text: content }],
        system,
      }).catch(async (error) => {
        if (signal.aborted) {
          await request(`/session/${thread}/abort`, AbortSignal.timeout(3_000), {}).catch(() => undefined);
        }
        throw error;
      }));
      if (result.info.error) throw providerError(result.info.error);
      const reply = textOf(result);
      if (!reply) throw new DeveloperChatError("empty_reply");
      const history = result.info.parentID ? await messages(thread, signal).catch(() => []) : [];
      const turn = history.filter((message) => message.info.parentID === result.info.parentID);
      const toolsUsed = [...new Set([...turn, result].flatMap((message) =>
        message.parts.flatMap((part) => part.type === "tool" && part.tool ? [part.tool] : []),
      ))];
      return { reply, toolsUsed };
    },
  };
}
