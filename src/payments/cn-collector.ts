import { z } from "zod";
import { verifyCnSigned, type CnLicense } from "./cn-license";
const schema = z
  .object({
    v: z.literal(1),
    kind: z.literal("statify-cn-collector"),
    sub: z.uuid(),
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    edition: z
      .object({
        batch_id: z.literal("founder-2990-v1"),
        title: z.literal("永久会员 · 原始股东典藏版账号"),
        issued_at: z.iso.datetime(),
        order_id: z.uuid(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type CollectorEdition = NonNullable<z.infer<typeof schema>["edition"]>;
export async function verifyCollector(
  raw: unknown,
  license: CnLicense,
  trust?: Parameters<typeof verifyCnSigned>[1],
) {
  const { envelope, payload } = await verifyCnSigned(raw, trust);
  const p = schema.parse(payload);
  if (p.sub !== license.sub || p.revision !== license.revision)
    throw Error("典藏身份与账号授权不一致，请刷新");
  return {
    envelope,
    edition:
      license.status === "active" && license.membership && license.v === 1
        ? p.edition
        : null,
  };
}
