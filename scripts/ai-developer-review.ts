import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { copyFile, lstat, open, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { DEVELOPER_REVIEW_LIMIT, type DeveloperChange, type DeveloperReview } from "../shared/ai-chat";
import { allowedProjectFile, developerProcessEnv, protectedProjectText } from "./ai-developer-workspace";

const execGit = promisify(execFile);
const fileLimit = 256_000;
const reviewLimit = 2_000_000;
const utf8 = new TextDecoder("utf-8", { fatal: true });

type ReviewEntry = DeveloperChange & { fingerprint?: string; before?: string };
export type ReviewSnapshot = { review: DeveloperReview; fingerprints: Map<string, string> };

export class ReviewError extends Error {
  constructor(readonly code: string, readonly status: number, readonly path?: string) {
    super(code);
  }
}

function safePath(path: string) {
  return path.length <= 500 && allowedProjectFile(path) && path.split("/").every((part) =>
    !/[<>:"|?*]|[. ]$/.test(part) && !/^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/i.test(part));
}

async function readProjectFile(root: string, path: string) {
  let target = root;
  const parts = path.split("/");
  for (const [index, part] of parts.entries()) {
    target = join(target, part);
    const stat = await lstat(target).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!stat) return null;
    if (stat.isSymbolicLink() || await realpath(target) !== target) throw new Error("Redirected file");
    if (index < parts.length - 1) {
      if (!stat.isDirectory()) throw new Error("Invalid parent directory");
      continue;
    }
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > fileLimit) throw new Error("Unsupported file");
    const content = await readFile(target);
    if (content.length > fileLimit) throw new Error("File too large");
    return content;
  }
  return null;
}

function matchesBlob(content: Buffer | null, oid?: string) {
  if (!content || !oid) return content === null && oid === undefined;
  return createHash(oid.length === 64 ? "sha256" : "sha1")
    .update("blob " + content.length + "\0").update(content).digest("hex") === oid;
}

export function createDeveloperReview(root: string, state: string, secrets: string[]) {
  const workspace = join(state, "workspace");
  const env = { ...developerProcessEnv(state), GIT_LITERAL_PATHSPECS: "1", GIT_ATTR_NOSYSTEM: "1" };
  const git = async (cwd: string, args: string[], signal: AbortSignal, index?: string) =>
    (await execGit("git", ["-c", "core.autocrlf=false", "-c", "core.quotePath=false", ...args], {
      cwd, env: index ? { ...env, GIT_INDEX_FILE: index } : env,
      windowsHide: true, maxBuffer: 4_000_000, signal,
    })).stdout;

  async function collect(signal: AbortSignal, selected?: string[]) {
    const workspaceRoot = await realpath(workspace);
    const mainRoot = await realpath(root);
    const [tracked, added, staged] = await Promise.all([
      git(workspace, ["diff", "--no-renames", "--no-ext-diff", "--name-status", "-z"], signal),
      git(workspace, ["ls-files", "--others", "--exclude-standard", "-z"], signal),
      git(workspace, ["ls-files", "--stage", "-z"], signal),
    ]);
    const paths = new Map<string, DeveloperChange["kind"]>();
    const trackedParts = tracked.split("\0");
    for (let i = 0; i + 1 < trackedParts.length; i += 2) {
      paths.set(trackedParts[i + 1], trackedParts[i] === "D" ? "deleted" : "modified");
    }
    for (const path of added.split("\0").filter(Boolean)) paths.set(path, "added");
    const names = selected ?? [...paths.keys()].sort().slice(0, DEVELOPER_REVIEW_LIMIT);
    const entries: ReviewEntry[] = [];
    const candidates: { entry: ReviewEntry; before: string | undefined; after: Buffer | null }[] = [];
    const indexFiles = new Map(staged.split("\0").flatMap((line) => {
      const entry = /^100(?:644|755) ([a-f0-9]{40,64}) 0\t([\s\S]+)$/.exec(line);
      return entry ? [[entry[2], entry[1]] as const] : [];
    }));

    for (const path of names) {
      const kind = paths.get(path);
      if (!kind || protectedProjectText("", path, secrets)) continue;
      const entry: ReviewEntry = { path, kind, state: "unsupported" };
      entries.push(entry);
      if (!safePath(path)) continue;
      const before = indexFiles.get(path);
      if (kind !== "added" && !before) continue;
      try {
        const after = await readProjectFile(workspaceRoot, path);
        if ((kind === "deleted") !== (after === null)) continue;
        if (after && protectedProjectText(path, utf8.decode(after), secrets)) continue;
        if (before) {
          const base = await git(workspace, ["cat-file", "blob", before], signal);
          if (Buffer.byteLength(base) > fileLimit || protectedProjectText(path, base, secrets)) continue;
        }
        candidates.push({ entry, before, after });
      } catch {
        signal.throwIfAborted();
      }
    }

    const newFiles = candidates.filter(({ entry }) => entry.kind === "added").map(({ entry }) => entry.path);
    const index = newFiles.length ? join(state, "review-index-" + randomBytes(12).toString("hex")) : undefined;
    let size = 0;
    try {
      if (index) {
        await copyFile(join(workspace, ".git", "index"), index);
        await git(workspace, ["add", "-N", "--", ...newFiles], signal, index);
      }
      for (const { entry, before, after } of candidates) {
        const patch = await git(workspace, [
          "diff", "--ita-invisible-in-index", "--full-index", "--no-renames", "--no-color",
          "--default-prefix", "--no-ext-diff", "--no-textconv", "--", entry.path,
        ], signal, index);
        const bytes = Buffer.byteLength(patch);
        if (!patch || /^Binary files /m.test(patch) || size + bytes > reviewLimit) continue;
        // Detect edits to the work copy during Git's diff generation.
        const now = await readProjectFile(workspaceRoot, entry.path).catch(() => undefined);
        if (now === undefined || (after ? !now?.equals(after) : now !== null)) continue;
        size += bytes;
        entry.diff = patch;
        const current = await readProjectFile(mainRoot, entry.path).catch(() => undefined);
        entry.state = current !== undefined && matchesBlob(current, before) ? "ready" : "conflict";
        if (entry.state === "ready") {
          entry.before = before;
          entry.fingerprint = createHash("sha256").update(patch).digest("hex");
        }
      }
    } finally {
      if (index) await unlink(index).catch(() => undefined);
    }
    return { entries, omitted: selected ? 0 : paths.size - names.length };
  }

  return {
    async preview(signal: AbortSignal): Promise<ReviewSnapshot> {
      const { entries, omitted } = await collect(signal);
      const fingerprints = new Map<string, string>();
      const files = entries.map(({ fingerprint, before: _before, ...entry }) => {
        if (fingerprint) fingerprints.set(entry.path, fingerprint);
        return entry;
      });
      return { review: { id: randomBytes(24).toString("hex"), files, omitted }, fingerprints };
    },

    async apply(snapshot: ReviewSnapshot, paths: string[], signal: AbortSignal) {
      // Both regional preview processes share the parent state directory for this project.
      const lockPath = join(dirname(state), "apply.lock");
      const lock = await open(lockPath, "wx").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "EEXIST") throw new ReviewError("review_busy", 409);
        throw error;
      });
      const patchPath = join(state, "approved-" + randomBytes(12).toString("hex") + ".patch");
      try {
        const { entries } = await collect(signal, paths);
        const patches = paths.map((path) => {
          const entry = entries.find((file) => file.path === path);
          if (entry?.state === "conflict") throw new ReviewError("review_conflict", 409, path);
          if (!entry?.fingerprint || snapshot.fingerprints.get(path) !== entry.fingerprint || !entry.diff) {
            throw new ReviewError("review_stale", 409, path);
          }
          return entry.diff;
        });
        await writeFile(patchPath, patches.join(""), { flag: "wx" });
        const applyArgs = ["apply", "--whitespace=nowarn"];
        await git(workspace, [...applyArgs, "--cached", "--check", patchPath], signal);
        await git(root, [...applyArgs, "--check", patchPath], signal).catch(() => {
          signal.throwIfAborted();
          throw new ReviewError("review_conflict", 409);
        });
        const mainRoot = await realpath(root);
        await Promise.all(entries.map(async ({ path, before }) => {
          const current = await readProjectFile(mainRoot, path).catch(() => undefined);
          if (current === undefined || !matchesBlob(current, before)) throw new ReviewError("review_conflict", 409, path);
        }));
        signal.throwIfAborted();
        // Once writing starts, let Git finish even if the HTTP deadline expires.
        const writeSignal = new AbortController().signal;
        await git(root, [...applyArgs, patchPath], writeSignal);
        const baselineUpdated = await git(workspace, [...applyArgs, "--cached", patchPath], writeSignal)
          .then(() => true, () => false);
        return { applied: paths, baselineUpdated };
      } finally {
        await unlink(patchPath).catch(() => undefined);
        await lock.close();
        await unlink(lockPath);
      }
    },
  };
}
