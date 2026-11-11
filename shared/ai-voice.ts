import { z } from "zod";

export const chatVoice = z.strictObject({
  samples: z.int().min(1).max(24),
  clauseLength: z.int().min(1).max(100),
  multiline: z.int().min(0).max(100),
  casual: z.int().min(0).max(100),
  polite: z.int().min(0).max(100),
  expressive: z.int().min(0).max(100),
});
export type ChatVoice = z.infer<typeof chatVoice>;
