import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const git = promisify(execFile);
export const developerMemoryFile = "STATIFY-DEVELOPER-MEMORY.md";
const textExtensions = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".html", ".md",
  ".bat", ".sh", ".yml", ".yaml", ".json", ".webmanifest", ".svg", ".conf", ".service",
]);
const imageExtensions = new Set([".png", ".webp", ".jpg", ".jpeg", ".ico"]);
const syntheticSaves = new Set([
  "tests/fixtures/foundation-baseline.json",
  "tests/fixtures/growth-baseline.json",
  "tests/fixtures/storage-baseline.json",
]);
const protectedText = /-----BEGIN [^-\r\n]*PRIVATE KEY-----|\b(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{16,})\b/i;

export function developerStatePath(root: string, region: "cn" | "global") {
  const key = createHash("sha256").update(resolve(root).toLowerCase()).digest("hex").slice(0, 16);
  return join(process.env.LOCALAPPDATA || join(homedir(), ".local", "share"), "Statify-AI", key, region);
}

export function allowedProjectFile(path: string) {
  if (/[\\:\x00-\x1f]/.test(path) || path.split("/").some((part) => !part ||
    (part.startsWith(".") && part !== ".gitignore") ||
    /^(?:node_modules|output|dist|statifybackups|backups?|saves?|credentials?|secrets?)$/i.test(part))) return false;
  const name = basename(path);
  if (/^opencode\.jsonc?$/i.test(name) || name === developerMemoryFile ||
    /(?:^|[._-])(?:secrets?|credentials?|api[_-]?keys?|backups?)(?:[._-]|$)/i.test(name)) return false;
  const extension = extname(path).toLowerCase();
  if (extension === ".json" && /(?:^|[\/._-])(?:saves?|exports?|fixtures?)(?:[\/._-]|$)/i.test(path)) {
    return syntheticSaves.has(path);
  }
  return name === ".gitignore" || textExtensions.has(extension) ||
    (path.startsWith("assets/") && imageExtensions.has(extension));
}

export function protectedProjectText(path: string, content: string, secrets: string[]) {
  const credential = /\b(?:api[_-]?key|password|client[_-]?secret|access[_-]?token)\s*["']?\s*[:=]\s*["'][^"'\r\n]{20,}["']/i;
  if (content.includes("\0") || protectedText.test(content) || credential.test(content) ||
    secrets.some((secret) => content.includes(secret))) return true;
  // Keep JSON saves out even when they were exported under a generic name.
  return path.endsWith(".json") && !syntheticSaves.has(path) &&
    (/"(?:schemaVersion|saveVersion)"\s*:/.test(content) || /"version"\s*:\s*"0\.2\.[12]"/.test(content)) &&
    /"(?:actions|attributes|entries|profile|actionHistory|statusHistory|player|characters)"\s*:/.test(content);
}

export function developerProcessEnv(state: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (/^(?:path|pathext|systemroot|windir|comspec|temp|tmp|systemdrive)$/i.test(name)) env[name] = value;
  }
  return {
    ...env,
    XDG_CONFIG_HOME: join(state, "config"),
    XDG_DATA_HOME: join(state, "data"),
    XDG_CACHE_HOME: join(state, "cache"),
    XDG_STATE_HOME: join(state, "state"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
  };
}

export async function prepareDeveloperWorkspace(root: string, state: string, secrets: string[]) {
  const workspace = join(state, "workspace");
  const ready = join(state, "workspace-ready");
  const sourceRoot = await realpath(root);
  const env = developerProcessEnv(state);
  const inWorkspace = (args: string[]) => git("git", ["-c", "core.autocrlf=false", ...args], {
    cwd: workspace, env, windowsHide: true, maxBuffer: 4_000_000,
  });
  const initialized = !!await lstat(ready).catch(() => undefined);
  let oldPaths: string[] = [];
  if (initialized) {
    await inWorkspace(["config", "--local", "core.autocrlf", "false"]);
    const { stdout: changed } = await inWorkspace(["diff", "--no-ext-diff", "--name-only", "-z"]);
    const { stdout: added } = await inWorkspace(["ls-files", "-z", "--others", "--exclude-standard"]);
    if (changed || added) return workspace;
    oldPaths = (await inWorkspace(["ls-files", "-z"])).stdout.split("\0").filter(allowedProjectFile);
  }

  const { stdout } = await git("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: sourceRoot, env, windowsHide: true, maxBuffer: 4_000_000,
  });
  await mkdir(workspace, { recursive: true });
  const workspaceRoot = await realpath(workspace);
  const copied = new Set<string>();
  for (const path of new Set(stdout.split("\0").filter(allowedProjectFile))) {
    const source = join(sourceRoot, path);
    const actual = await realpath(source).catch(() => undefined);
    if (!actual || relative(sourceRoot, actual).split(sep).join("/") !== path) continue;
    const info = await lstat(source);
    if (!info.isFile() || info.size > 10_000_000) continue;
    if (!imageExtensions.has(extname(path).toLowerCase()) &&
      protectedProjectText(path, await readFile(source, "utf8"), secrets)) continue;
    const destination = join(workspace, path);
    await mkdir(dirname(destination), { recursive: true });
    if (await realpath(dirname(destination)) !== join(workspaceRoot, dirname(path))) {
      throw new Error("Developer workspace contains a redirected directory");
    }
    const existing = await lstat(destination).catch(() => undefined);
    if (existing && !existing.isFile()) throw new Error("Developer workspace contains a redirected file");
    await copyFile(source, destination);
    copied.add(path);
  }
  for (const path of oldPaths) {
    if (copied.has(path)) continue;
    const stale = join(workspace, path);
    if (await realpath(stale) !== join(workspaceRoot, path)) throw new Error("Developer workspace contains a redirected file");
    await unlink(stale);
  }
  if (!initialized) {
    await inWorkspace(["init", "--quiet"]);
    await inWorkspace(["config", "--local", "core.autocrlf", "false"]);
    await writeFile(join(workspace, ".git", "info", "exclude"), `/${developerMemoryFile}\n`);
    await writeFile(join(workspace, developerMemoryFile), "# Statify AI 开发记忆\n\n", { flag: "a" });
  }
  await inWorkspace(["add", "--all"]);
  await writeFile(ready, "");
  return workspace;
}
