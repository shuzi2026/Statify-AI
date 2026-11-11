import { it, expect } from "vitest";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { verifyCollector } from "./cn-collector";
import { verifyCnLicense, type CnLicense } from "./cn-license";
it("collector proof is signed separately, binds account and revision, and never expands old licenses", async () => {
  const k = generateKeyPairSync("ec", { namedCurve: "prime256v1" }),
    trust = {
      kid: "test",
      jwk: k.publicKey.export({ format: "jwk" }) as {
        kty: string;
        x: string;
        y: string;
        crv: string;
      },
    };
  const wrap = (p: unknown) => {
    const payload = Buffer.from(JSON.stringify(p)).toString("base64url");
    return {
      kid: trust.kid,
      payload,
      signature: sign("sha256", Buffer.from(payload), {
        key: k.privateKey,
        dsaEncoding: "ieee-p1363",
      }).toString("base64url"),
    };
  };
  const license: CnLicense = {
    v: 1,
    iss: "statify-cn-test",
    aud: "statify-android-cn-test",
    region: "cn",
    environment: "sandbox",
    sub: randomUUID(),
    email: "test@example.invalid",
    character_id: null,
    character_nickname: null,
    status: "active",
    membership: true,
    trial_ends_at: null,
    trial_available: false,
    revision: 2,
    iat: Math.floor(Date.now() / 1000),
    jti: randomUUID(),
  };
  const p = {
    v: 1,
    kind: "statify-cn-collector",
    sub: license.sub,
    revision: 2,
    edition: {
      batch_id: "founder-2990-v1",
      title: "永久会员 · 原始股东典藏版账号",
      issued_at: new Date().toISOString(),
      order_id: randomUUID(),
    },
  };
  expect((await verifyCollector(wrap(p), license, trust)).edition?.title).toBe(
    p.edition.title,
  );
  expect((await verifyCnLicense(wrap(license), trust)).license.v).toBe(1);
  await expect(
    verifyCnLicense(wrap({ ...license, edition: p.edition }), trust),
  ).rejects.toThrow();
  for (const bad of [
    { ...p, sub: randomUUID() },
    { ...p, revision: 1 },
    { ...p, kind: "other" },
  ])
    await expect(verifyCollector(wrap(bad), license, trust)).rejects.toThrow();
  await expect(
    verifyCollector(
      { ...wrap(p), signature: wrap({ ...p, revision: 3 }).signature },
      license,
      trust,
    ),
  ).rejects.toThrow();
  expect(
    (await verifyCollector(wrap(p), { ...license, status: "disabled" }, trust))
      .edition,
  ).toBeNull();
  expect(
    (await verifyCollector(wrap({ ...p, edition: null }), license, trust))
      .edition,
  ).toBeNull();
});
