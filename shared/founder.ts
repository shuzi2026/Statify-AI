import { z } from "zod";

// Separate from the membership licence so existing clients keep their strict v1/v2 contract.
export const FounderPayloadSchema = z
  .object({
    v: z.literal(1),
    kind: z.literal("statify-existing-founder"),
    region: z.enum(["cn", "global"]),
    environment: z.enum(["sandbox", "live"]),
    sub: z.uuid(),
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    edition: z
      .object({
        batch: z.literal("existing-permanent-20261108"),
        issued_at: z.iso.datetime(),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type FounderEdition = NonNullable<
  z.infer<typeof FounderPayloadSchema>["edition"]
>;
export function readFounderPayload(
  payload: unknown,
  identity: {
    region: "cn" | "global";
    environment: "sandbox" | "live";
    sub: string;
    revision: number;
    permanent: boolean;
  },
) {
  const p = FounderPayloadSchema.parse(payload);
  if (
    p.region !== identity.region ||
    p.environment !== identity.environment ||
    p.sub !== identity.sub ||
    p.revision !== identity.revision
  )
    throw Error("Founder identity does not match the verified membership.");
  return identity.permanent ? p.edition : null;
}
