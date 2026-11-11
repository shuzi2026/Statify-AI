import { createHmac, timingSafeEqual } from "node:crypto";
import type { z } from "zod";

export function demoToken<T>(key: string | Buffer, purpose: string, schema: z.ZodType<T>, payloadLimit = 1500) {
  const sign = (payload: string) => createHmac("sha256", key).update(`${purpose}.${payload}`).digest();

  return {
    seal(value: T) {
      const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
      return `${payload}.${sign(payload).toString("base64url")}`;
    },
    open(token: string) {
      if (token.length > payloadLimit + 44) return;
      const match = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(token);
      if (!match) return;
      const [, payload, encodedSignature] = match;
      const signature = Buffer.from(encodedSignature, "base64url");
      if (signature.toString("base64url") !== encodedSignature || !timingSafeEqual(signature, sign(payload))) return;
      try {
        return schema.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))).data;
      } catch {
        return undefined;
      }
    },
  };
}
