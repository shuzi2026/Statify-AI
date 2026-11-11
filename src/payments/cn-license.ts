import { z } from "zod";
import trust from "./cn-trust.json";
export const envelopeSchema = z
  .object({
    kid: z.string().max(64),
    payload: z.string().max(8192),
    signature: z.string().max(256),
  })
  .strict();
export type CnEnvelope = z.infer<typeof envelopeSchema>;
const common = {
  iss: z.literal("statify-cn-test"),
  aud: z.literal("statify-android-cn-test"),
  region: z.literal("cn"),
  environment: z.literal("sandbox"),
  sub: z.uuid(),
  email: z.email(),
  character_id: z.uuid().nullable(),
  character_nickname: z.string().max(80).nullable(),
  status: z.enum(["active", "disabled"]),
  membership: z.boolean(),
  trial_ends_at: z.number().finite().positive().nullable(),
  trial_available: z.boolean(),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  iat: z.number().int().positive(),
  jti: z.uuid(),
};
const schema = z.discriminatedUnion("v", [
  z.object({ v: z.literal(1), ...common }).strict(),
  z
    .object({
      v: z.literal(2),
      ...common,
      membership_ends_at: z
        .number()
        .int()
        .positive()
        .max(Number.MAX_SAFE_INTEGER),
    })
    .strict(),
]);
export type CnLicense = z.infer<typeof schema>;
export function decode64(value: string) {
  return Uint8Array.from(
    atob(value.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
}
export async function verifyCnLicense(
  raw: unknown,
  publicTrust: typeof trust = trust,
): Promise<{ envelope: CnEnvelope; license: CnLicense }> {
  const { envelope, payload } = await verifyCnSigned(raw, publicTrust);
  return { envelope, license: schema.parse(payload) };
}
export async function verifyCnSigned(
  raw: unknown,
  publicTrust: typeof trust = trust,
) {
  const envelope = envelopeSchema.parse(raw);
  if (envelope.kid !== publicTrust.kid)
    throw Error("离线许可签名版本不匹配，请联网登录");
  const key = await crypto.subtle.importKey(
    "jwk",
    publicTrust.jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  if (
    !(await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      decode64(envelope.signature),
      new TextEncoder().encode(envelope.payload),
    ))
  )
    throw Error("离线许可校验失败，请联网登录");
  return {
    envelope,
    payload: JSON.parse(
      new TextDecoder().decode(decode64(envelope.payload)),
    ) as unknown,
  };
}
