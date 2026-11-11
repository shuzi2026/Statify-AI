import { it, expect } from "vitest";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { verifyCnLicense } from "./cn-license";
it("monthly v2 requires a signed finite deadline and never accepts expiry fields on v1", async () => {
  const key = generateKeyPairSync("ec", { namedCurve: "prime256v1" }),
    trust = {
      kid: "test-key",
      jwk: key.publicKey.export({ format: "jwk" }) as {
        kty: string;
        x: string;
        y: string;
        crv: string;
      },
    };
  const p = {
    v: 2,
    iss: "statify-cn-test",
    aud: "statify-android-cn-test",
    region: "cn",
    environment: "sandbox",
    sub: randomUUID(),
    email: "cn-test@example.com",
    character_id: null,
    character_nickname: null,
    status: "active",
    membership: true,
    membership_ends_at: Date.now() + 30 * 86400000,
    trial_ends_at: null,
    trial_available: true,
    revision: 2,
    iat: Math.floor(Date.now() / 1000),
    jti: randomUUID(),
  };
  const wrap = (value: unknown) => {
    const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
    return {
      kid: trust.kid,
      payload,
      signature: sign("sha256", Buffer.from(payload), {
        key: key.privateKey,
        dsaEncoding: "ieee-p1363",
      }).toString("base64url"),
    };
  };
  expect((await verifyCnLicense(wrap(p), trust)).license.v).toBe(2);
  for (const value of [
    { ...p, membership_ends_at: undefined },
    { ...p, membership_ends_at: -1 },
    { ...p, v: 1 },
  ])
    await expect(verifyCnLicense(wrap(value), trust)).rejects.toThrow();
  await expect(
    verifyCnLicense(
      {
        ...wrap(p),
        payload: wrap({ ...p, membership_ends_at: p.membership_ends_at + 1 })
          .payload,
      },
      trust,
    ),
  ).rejects.toThrow();
});
it("verifies a permanent signed license and rejects changed membership/foreign keys", async () => {
  const key = generateKeyPairSync("ec", { namedCurve: "prime256v1" }),
    trust = {
      kid: "test-key",
      jwk: key.publicKey.export({ format: "jwk" }) as {
        kty: string;
        x: string;
        y: string;
        crv: string;
      },
    };
  const p = {
    v: 1,
    iss: "statify-cn-test",
    aud: "statify-android-cn-test",
    region: "cn",
    environment: "sandbox",
    sub: randomUUID(),
    email: "cn-test@example.com",
    character_id: null,
    character_nickname: null,
    status: "active",
    membership: true,
    trial_ends_at: null,
    trial_available: true,
    revision: 2,
    iat: Math.floor(Date.now() / 1000),
    jti: randomUUID(),
  };
  const payload = Buffer.from(JSON.stringify(p)).toString("base64url"),
    envelope = {
      kid: trust.kid,
      payload,
      signature: sign("sha256", Buffer.from(payload), {
        key: key.privateKey,
        dsaEncoding: "ieee-p1363",
      }).toString("base64url"),
    };
  expect((await verifyCnLicense(envelope, trust)).license.membership).toBe(
    true,
  );
  expect((await verifyCnLicense(envelope, trust)).license).not.toHaveProperty(
    "exp",
  );
  await expect(
    verifyCnLicense(
      {
        ...envelope,
        payload: Buffer.from(JSON.stringify({ ...p, revision: 99 })).toString(
          "base64url",
        ),
      },
      trust,
    ),
  ).rejects.toThrow();
  await expect(
    verifyCnLicense(envelope, { ...trust, kid: "wrong-key" }),
  ).rejects.toThrow();
});
