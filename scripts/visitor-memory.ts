import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const maxPreferences = 20;
const dimensions = 1536;
export const preferenceLength = 300;

export type VisitorMemory = {
  remember: (visitor: string, preference: string) => Promise<"saved" | "duplicate" | "full">;
  recall: (visitor: string, query: string | null) => Promise<string[]>;
  clear: (visitor: string) => Promise<void>;
};

export async function guestMemorySigningKey(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "visitor-signing.key");
  try {
    await writeFile(path, randomBytes(32).toString("base64url"), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return (await readFile(path, "utf8")).trim();
}

export async function createVisitorMemory(directory: string, apiKey: string): Promise<VisitorMemory> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  process.env.MEM0_TELEMETRY = "false";
  const { Memory } = await import("mem0ai/oss");
  async function embedDocuments(input: string[]) {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input, dimensions }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw Error("Preference embedding request failed");
    const { data } = await response.json() as { data?: { index: number; embedding: number[] }[] };
    const vectors = data?.sort((a, b) => a.index - b.index);
    if (vectors?.length !== input.length ||
        vectors.some(({ index, embedding }, i) => index !== i || embedding?.length !== dimensions || !embedding.every(Number.isFinite)))
      throw Error("Invalid preference embedding response");
    return vectors.map(({ embedding }) => embedding);
  }
  const memory = new Memory({
    // Mem0's embeddings adapter lets the server bound the duration of an OpenAI request.
    embedder: { provider: "langchain", config: {
      model: { embedDocuments, embedQuery: async (text: string) => (await embedDocuments([text]))[0] },
    } },
    llm: { provider: "openai", config: { apiKey } },
    vectorStore: {
      provider: "memory",
      config: { dbPath: join(directory, "preferences.sqlite"), collectionName: "statify_preferences", dimension: dimensions },
    },
    disableHistory: true,
  });

  const scope = (visitor: string) => ({ user_id: visitor });
  const list = (visitor: string) => memory.getAll({ filters: scope(visitor), topK: maxPreferences });
  return {
    async remember(visitor, preference) {
      const { results } = await list(visitor);
      if (results.some((item) => item.memory === preference)) return "duplicate";
      if (results.length >= maxPreferences) return "full";
      const added = await memory.add(preference, { userId: visitor, infer: false });
      if (!added.results.length) throw Error("Mem0 did not save the preference");
      return "saved";
    },
    async recall(visitor, query) {
      const { results } = await list(visitor);
      if (!query || !results.length) return results.flatMap(({ memory }) => memory ? [memory] : []);
      const matches = await memory.search(query, { filters: scope(visitor), topK: 3, threshold: 0.35 });
      return matches.results.flatMap(({ memory }) => memory ? [memory] : []);
    },
    async clear(visitor) {
      await memory.deleteAll({ userId: visitor });
    },
  };
}

export function memoryCommand(message: string) {
  if (/^(?:清除(?:你)?(?:记住的|保存的)?所有(?:偏好|记忆)|忘记(?:你)?(?:记住的)?所有(?:偏好|记忆)|clear (?:all )?(?:my )?(?:saved )?(?:preferences|memories)|forget all (?:my )?(?:saved )?(?:preferences|memories))[。.!！\s]*$/i.test(message))
    return { type: "clear" as const };
  const match = /^(?:(?:请|帮我|请帮我)?记住(?:一下)?[：:,，\s]*|(?:please\s+)?remember(?:\s+that\b)?[\s:]+)([\s\S]+)$/i.exec(message);
  const preference = match?.[1].trim();
  if (preference) return { type: "remember" as const, preference };
}
