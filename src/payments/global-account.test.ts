import { it, expect, vi, afterEach } from "vitest";
import { webcrypto } from "node:crypto";
vi.mock("./deployment", () => ({
  localOnly: false,
  paymentRegion: "global",
  paymentEnvironment: "sandbox",
  cnAccountBackend: false,
  globalAppBackend: true,
}));
const transport = vi.hoisted(() => ({
  paymentRequest: vi.fn(),
  readOfflineAccount: vi.fn(),
  writeOfflineAccount: vi.fn(),
  clearCnSession: vi.fn(),
  onPaymentResume: vi.fn(() => () => {}),
}));
vi.mock("./transport", () => transport);
const config = {
  region: "global",
  environment: "sandbox",
  global_app_v1: true,
  account_identity: "email",
  account_identity_guard_enabled: true,
  sales_enabled: false,
  cloud_enabled: true,
  offer: {
    id: "early",
    amount: "7.40",
    currency: "USD",
    terms_version: "",
    terms_url: "",
  },
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});
async function fixture() {
  vi.stubGlobal("crypto", webcrypto);
  const keys = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  vi.stubEnv(
    "VITE_STATIFY_GLOBAL_TRUST",
    JSON.stringify(await crypto.subtle.exportKey("jwk", keys.publicKey)),
  );
  const id = crypto.randomUUID();
  async function license(member: boolean, revision: number) {
    const payload = Buffer.from(
      JSON.stringify({
        v: 1,
        iss: "statify-global",
        region: "global",
        environment: "sandbox",
        sub: id,
        email: "player@example.test",
        member,
        trial_ends_at: null,
        trial_available: false,
        revision,
        iat: Date.now(),
      }),
    ).toString("base64url");
    return {
      kid: "global-v1",
      payload,
      signature: Buffer.from(
        await crypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          keys.privateKey,
          new TextEncoder().encode(payload),
        ),
      ).toString("base64url"),
    };
  }
  transport.writeOfflineAccount.mockResolvedValue(undefined);
  transport.clearCnSession.mockResolvedValue(undefined);
  async function founder(revision: number, extra: Record<string, unknown> = {}) {
    const payload = Buffer.from(JSON.stringify({v:1,kind:"statify-existing-founder",region:"global",environment:"sandbox",sub:id,revision,edition:{batch:"existing-permanent-20261108",issued_at:new Date().toISOString()},...extra})).toString("base64url");
    return {kid:"global-v1",payload,signature:Buffer.from(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},keys.privateKey,new TextEncoder().encode(payload))).toString("base64url")};
  }
  return { id, license, founder, api: await import("./global-account") };
}
it("founder recognition loads offline, rejects a different region/revision/signature, and clears after source revocation", async () => {
  const f=await fixture(),receipt=await f.license(true,2),founderReceipt=await f.founder(2);
  transport.readOfflineAccount.mockResolvedValue(JSON.stringify({receipt,founderReceipt,seen:{[f.id]:2},lastSeen:Date.now()}));
  transport.paymentRequest.mockRejectedValue(Error("offline"));
  vi.stubGlobal("window",{addEventListener:vi.fn(),removeEventListener:vi.fn()});
  const stop=f.api.startGlobalAccount();
  await vi.waitFor(()=>expect(f.api.getGlobalAccount().founder?.batch).toBe("existing-permanent-20261108"));
  stop();
  for(const bad of [await f.founder(1),await f.founder(2,{region:"cn"}),await f.founder(2,{environment:"live"}),await f.founder(2,{sub:crypto.randomUUID()}),{...founderReceipt,signature:(await f.founder(3)).signature}]){
    transport.paymentRequest.mockResolvedValueOnce({status:200,data:{license:receipt,founder:bad}});
    await expect(f.api.globalAction("/licenses/status",receipt)).rejects.toThrow();
    expect(f.api.getGlobalAccount().founder).not.toBeNull();
  }
  transport.paymentRequest.mockResolvedValueOnce({status:200,data:{license:await f.license(false,3),founder:await f.founder(3,{edition:null})}});
  await f.api.globalAction("/licenses/status",receipt);
  expect(f.api.getGlobalAccount().founder).toBeNull();
  expect(f.api.getGlobalAccount().entitlement?.member).toBe(false);
  expect(JSON.parse(transport.writeOfflineAccount.mock.lastCall![0]).founderReceipt).toBeTruthy();
  transport.paymentRequest.mockResolvedValue({status:200,data:{}});
  await f.api.logoutGlobalAccount();
  expect(JSON.parse(transport.writeOfflineAccount.mock.lastCall![0]).founderReceipt).toBeNull();
});
it("an expired online session retains signed membership and refresh verifies the cookie separately", async () => {
  const f = await fixture(),
    signed = await f.license(true, 1);
  transport.paymentRequest.mockResolvedValue({
    status: 200,
    data: { license: signed },
  });
  await f.api.globalAction("/auth/login", {});
  transport.paymentRequest.mockResolvedValueOnce({
    status: 401,
    data: { title: "sign in" },
  });
  await expect(f.api.globalAction("/orders")).rejects.toMatchObject({
    kind: "session-expired",
    status: 401,
  });
  await f.api.globalAction("/licenses/status", signed);
  expect(f.api.getGlobalAccount()).toMatchObject({
    sessionExpired: true,
    offline: true,
    entitlement: { member: true },
  });
  transport.paymentRequest.mockImplementation(async (path: string) => ({
    status: 200,
    data:
      path === "/config?offer_version=2"
        ? config
        : path.startsWith("/me")
          ? { account: null, entitlement: null }
          : { license: signed },
  }));
  await f.api.refreshGlobalAccount();
  expect(f.api.getGlobalAccount()).toMatchObject({
    sessionExpired: true,
    offline: true,
    entitlement: { member: true },
  });
  expect(
    transport.paymentRequest.mock.calls.filter((call) =>
      call[0].startsWith("/orders"),
    ),
  ).toHaveLength(1);
});
it("a caller cancellation during asynchronous signature verification cannot grant or persist membership", async () => {
  const f = await fixture(),
    signed = await f.license(true, 1);
  let finish!: (value: boolean) => void;
  const verifier = vi.spyOn(crypto.subtle, "verify").mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  try {
    transport.paymentRequest.mockResolvedValue({
      status: 200,
      data: { license: signed },
    });
    const controller = new AbortController();
    const result = f.api.globalAction(
      "/auth/login",
      {},
      { signal: controller.signal },
    );
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    controller.abort();
    finish(true);
    await expect(result).rejects.toMatchObject({ kind: "cancelled" });
    expect(f.api.getGlobalAccount().account).toBeNull();
    expect(transport.writeOfflineAccount).not.toHaveBeenCalled();
  } finally {
    verifier.mockRestore();
  }
});
it("old global logout cleanup cannot remove a newer native session", async () => {
  const f = await fixture(),
    signed = await f.license(true, 1);
  let finish!: (value: unknown) => void;
  transport.paymentRequest.mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const old = f.api.logoutGlobalAccount();
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  transport.paymentRequest.mockResolvedValue({
    status: 200,
    data: { license: signed },
  });
  await f.api.globalAction("/auth/login", {});
  finish({ status: 200, data: { ok: true } });
  await old;
  expect(transport.clearCnSession).not.toHaveBeenCalled();
  expect(f.api.getGlobalAccount().account?.id).toBe(f.id);
});
it("structured conflict details survive the regional API adapter", async () => {
  const f = await fixture();
  transport.paymentRequest.mockResolvedValueOnce({
    status: 409,
    data: { title: "changed", code: "cloud_conflict", revision: 7 },
  });
  await expect(f.api.globalAction("/cloud/sync", {})).rejects.toMatchObject({
    status: 409,
    kind: "http",
    details: { code: "cloud_conflict", revision: 7 },
  });
});
it("a valid global receipt after a network failure does not establish online availability", async () => {
  const f = await fixture(),
    signed = await f.license(true, 1);
  transport.paymentRequest.mockResolvedValue({
    status: 200,
    data: { license: signed },
  });
  await f.api.globalAction("/auth/login", {});
  transport.paymentRequest.mockRejectedValueOnce(Error("offline"));
  await f.api.refreshGlobalAccount();
  expect(f.api.getGlobalAccount()).toMatchObject({
    offline: true,
    sessionExpired: false,
  });
  await f.api.globalAction("/licenses/status", signed);
  expect(f.api.getGlobalAccount()).toMatchObject({
    offline: true,
    sessionExpired: false,
    entitlement: { member: true },
  });
});
it.each([
  { region: "cn" },
  { environment: "live" },
  { offer: { ...config.offer, amount: "0.01" } },
  { offer: { ...config.offer, currency: "CNY" } },
])(
  "mismatched global service contract %j cannot start authenticated requests",
  async (patch) => {
    const f = await fixture();
    transport.paymentRequest.mockResolvedValueOnce({
      status: 200,
      data: { ...config, ...patch },
    });
    await f.api.refreshGlobalAccount();
    expect(f.api.getGlobalAccount()).toMatchObject({
      config: null,
      offline: true,
      account: null,
    });
    expect(transport.paymentRequest).toHaveBeenCalledOnce();
    expect(
      (await import("../runtime-diagnostics"))
        .runtimeIssues()
        .some((row) => row.category === "configuration"),
    ).toBe(true);
  },
);
it("repeated global initialization shares offline loading and a disposed config response cannot publish", async () => {
  vi.stubGlobal("window", new EventTarget());
  const f = await fixture();
  transport.readOfflineAccount.mockResolvedValue("");
  let resolve!: (value: unknown) => void;
  transport.paymentRequest.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const a = f.api.startGlobalAccount(),
    b = f.api.startGlobalAccount();
  await vi.waitFor(() =>
    expect(transport.paymentRequest).toHaveBeenCalledOnce(),
  );
  expect(transport.readOfflineAccount).toHaveBeenCalledOnce();
  a();
  b();
  resolve({ status: 200, data: config });
  await new Promise((r) => setTimeout(r, 0));
  expect(f.api.getGlobalAccount().config).toBeNull();
  expect(f.api.getGlobalAccount().ready).toBe(false);
  expect(transport.paymentRequest).toHaveBeenCalledOnce();
});
it("only a verified global signature can grant membership; later revocation rejects a delayed older receipt", async () => {
  const f = await fixture(),
    active = await f.license(true, 1),
    revoked = await f.license(false, 2);
  transport.paymentRequest
    .mockResolvedValueOnce({ status: 200, data: { ...config } })
    .mockResolvedValueOnce({ status: 200, data: { license: active } })
    .mockResolvedValue({ status: 200, data: { items: [] } });
  await f.api.refreshGlobalAccount();
  expect(f.api.getGlobalAccount().entitlement?.member).toBe(true);
  transport.paymentRequest.mockResolvedValueOnce({
    status: 200,
    data: { license: revoked },
  });
  await f.api.globalAction("/licenses/status", active);
  expect(f.api.getGlobalAccount().entitlement?.member).toBe(false);
  transport.paymentRequest.mockResolvedValueOnce({
    status: 200,
    data: { license: active },
  });
  await expect(f.api.globalAction("/licenses/status", active)).rejects.toThrow(
    "outdated",
  );
  expect(f.api.getGlobalAccount().entitlement?.member).toBe(false);
});
it("an account change prevents a delayed signed response from restoring a signed-out identity", async () => {
  const f = await fixture(),
    active = await f.license(true, 1);
  let finish!: (r: unknown) => void;
  transport.paymentRequest.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const old = f.api.globalAction("/auth/login", {
    username: "player@example.test",
    password: "example password",
  });
  await Promise.resolve();
  transport.paymentRequest.mockResolvedValue({
    status: 200,
    data: { ok: true },
  });
  await f.api.logoutGlobalAccount();
  finish({ status: 200, data: { license: active } });
  await expect(old).rejects.toThrow("account changed");
  expect(f.api.getGlobalAccount().account).toBeNull();
});
it("a signed offline receipt loads without network access and logout clears native session even if persistence fails", async () => {
  const f = await fixture(),
    active = await f.license(true, 1);
  transport.readOfflineAccount.mockResolvedValue(
    JSON.stringify({
      receipt: active,
      seen: { [f.id]: 1 },
      lastSeen: Date.now(),
    }),
  );
  transport.paymentRequest.mockRejectedValue(Error("offline"));
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  const stop = f.api.startGlobalAccount();
  await vi.waitFor(() =>
    expect(f.api.getGlobalAccount().entitlement?.member).toBe(true),
  );
  transport.writeOfflineAccount.mockRejectedValue(Error("disk"));
  await expect(f.api.logoutGlobalAccount()).rejects.toThrow("disk");
  expect(transport.clearCnSession).toHaveBeenCalled();
  expect(f.api.getGlobalAccount().account).toBeNull();
  stop();
});
