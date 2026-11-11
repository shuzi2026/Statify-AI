import { beforeEach, afterEach, it, expect, vi } from "vitest";
const bridge = vi.hoisted(() => ({
  request: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  clear: vi.fn(),
  verify: vi.fn(),
  verifySigned: vi.fn(),
}));
vi.mock("./transport", () => ({
  paymentRequest: bridge.request,
  readOfflineAccount: bridge.read,
  writeOfflineAccount: bridge.write,
  clearCnSession: bridge.clear,
  onPaymentResume: () => () => {},
}));
vi.mock("./cn-license", () => ({ verifyCnLicense: bridge.verify, verifyCnSigned: bridge.verifySigned }));
function license(member: boolean, revision: number) {
  return {
    sub: "account-a",
    email: "test@example.com",
    character_id: "role-a",
    character_nickname: "本地角色",
    status: "active",
    membership: member,
    trial_ends_at: null,
    trial_available: true,
    revision,
  };
}
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  bridge.read.mockResolvedValue("");
  bridge.write.mockResolvedValue(undefined);
  bridge.clear.mockResolvedValue(undefined);
  bridge.verify.mockImplementation(async (value) => ({
    envelope: value,
    license: license(value.member, value.revision),
  }));
});
afterEach(() => vi.unstubAllGlobals());
it("existing-founder receipts are bound to the CN permanent licence and cleared on a newer revocation", async () => {
  const id="00000000-0000-4000-8000-000000000001";
  bridge.verify.mockImplementation(async value=>({envelope:value,license:{...license(value.member,value.revision),sub:id,v:1}}));
  bridge.verifySigned.mockImplementation(async value=>({envelope:value,payload:value}));
  const signed={v:1,kind:"statify-existing-founder",region:"cn",environment:"sandbox",sub:id,revision:2,edition:{batch:"existing-permanent-20261108",issued_at:new Date().toISOString()}};
  bridge.request.mockResolvedValueOnce({status:200,data:{license:{member:true,revision:2},founder:signed}});
  const api=await import("./cn-account");await api.cnAction("/auth/login",{});
  expect(api.getCnAccount().founder?.batch).toBe("existing-permanent-20261108");
  expect(JSON.parse(bridge.write.mock.lastCall![0]).founderReceipt).toEqual(signed);
  bridge.request.mockResolvedValueOnce({status:200,data:{license:{member:true,revision:2},founder:{...signed,region:"global"}}});
  await expect(api.cnAction("/licenses/status",{})).rejects.toThrow();
  bridge.request.mockResolvedValueOnce({status:200,data:{license:{member:false,revision:3},founder:{...signed,revision:3,edition:null}}});
  await api.cnAction("/licenses/status",{});
  expect(api.getCnAccount().founder).toBeNull();expect(api.getCnAccount().entitlement?.member).toBe(false);
});
it("shows a Chinese fallback when the CN service returns an HTTP error without a title", async () => {
  bridge.request.mockResolvedValue({ status: 503, data: {} });
  const client = await import("./cn-account");
  await client.refreshCnAccount();
  expect(client.getCnAccount().error).toBe("暂时无法读取会员状态，请稍后重试。");
  await expect(client.cnAction("/codes/redeem", { code: "fixture" })).rejects.toMatchObject({
    status: 503,
    message: "请求未完成，请稍后重试。",
  });
});
it("exposes live checkout independently of the existing CN account identity and rejects unknown environments", async () => {
  const config = { region: "cn", environment: "sandbox", backend: "cn-postgres-v1", alipay_enabled: true, alipay_environment: "live", alipay_channels: ["app"], alipay_sandbox_enabled: false, alipay_offer: { amount: "29.90", currency: "CNY", subject: "Statify 永久会员", terms_version: "permanent-20261107-v1" } };
  bridge.request.mockImplementation(async (path) => ({ status: 200, data: path === "/config" ? config : { account: null } }));
  const client = await import("./cn-account");
  await client.refreshCnAccount();
  expect(client.getCnAccount().config).toMatchObject({ environment: "sandbox", alipay_environment: "live", alipay_sandbox_enabled: false, alipay_channels: ["app"] });
  config.alipay_environment = "unknown";
  config.alipay_sandbox_enabled = true;
  await client.refreshCnAccount();
  expect(client.getCnAccount().config?.alipay_offer).toBeUndefined();
});
it("publishes an enabled sandbox offer and removes it when the service disables checkout", async () => {
  const offer = { amount: "0.01", currency: "CNY", subject: "沙箱会员", terms_version: "sandbox-v1" };
  const config = { region: "cn", environment: "sandbox", backend: "cn-postgres-v1", alipay_sandbox_enabled: true, alipay_offer: offer };
  bridge.request.mockImplementation(async (path) => ({ status: 200, data: path === "/config" ? config : { account: null } }));
  const client = await import("./cn-account");
  await client.refreshCnAccount();
  expect(client.getCnAccount().config?.alipay_sandbox_enabled).toBe(true);
  expect(client.getCnAccount().config?.alipay_offer).toEqual(offer);
  config.alipay_sandbox_enabled = false;
  await client.refreshCnAccount();
  expect(client.getCnAccount().config?.alipay_sandbox_enabled).not.toBe(true);
  expect(client.getCnAccount().config?.alipay_offer).toBeUndefined();
});
it.each([undefined, { amount: "0.00", currency: "CNY", subject: "test", terms_version: "v1" }, { amount: "0.01", currency: "USD", subject: "test", terms_version: "v1" }])("does not expose checkout with an invalid or missing sandbox offer: %j", async (offer) => {
  bridge.request.mockImplementation(async (path) => ({ status: 200, data: path === "/config" ? { region: "cn", environment: "sandbox", backend: "cn-postgres-v1", alipay_sandbox_enabled: true, alipay_offer: offer } : { account: null } }));
  const client = await import("./cn-account");
  await client.refreshCnAccount();
  expect(client.getCnAccount().config?.alipay_sandbox_enabled).not.toBe(true);
  expect(client.getCnAccount().config?.alipay_offer).toBeUndefined();
});
it("shared CN initialization performs one offline read and ignores delayed signature verification after stop", async () => {
  vi.stubGlobal("window", new EventTarget());
  bridge.read.mockResolvedValueOnce(
    JSON.stringify({ receipt: { member: true, revision: 1 } }),
  );
  let finish!: (value: unknown) => void;
  bridge.verify.mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const client = await import("./cn-account");
  const a = client.startCnAccount(),
    b = client.startCnAccount();
  await vi.waitFor(() => expect(bridge.verify).toHaveBeenCalledOnce());
  expect(bridge.read).toHaveBeenCalledOnce();
  a();
  b();
  finish({ envelope: {}, license: license(true, 1) });
  await new Promise((r) => setTimeout(r, 0));
  expect(client.getCnAccount().account).toBeNull();
  expect(bridge.write).not.toHaveBeenCalled();
  expect(bridge.request).not.toHaveBeenCalled();
});
it("the last CN owner clears a scheduled monthly-expiry notification", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("window", new EventTarget());
  try {
    bridge.verify.mockResolvedValue({
      envelope: {},
      license: {
        ...license(true, 1),
        v: 2,
        membership_ends_at: Date.now() + 60000,
      },
    });
    bridge.request.mockResolvedValue({ status: 200, data: { license: {} } });
    const client = await import("./cn-account");
    await client.cnAction("/auth/login", {});
    expect(vi.getTimerCount()).toBe(1);
    const a = client.startCnAccount(),
      b = client.startCnAccount();
    a();
    expect(vi.getTimerCount()).toBe(1);
    b();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
it("disposing during config loading prevents the old lifecycle from publishing", async () => {
  vi.stubGlobal("window", new EventTarget());
  let resolve!: (value: unknown) => void;
  bridge.request.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const client = await import("./cn-account");
  const stop = client.startCnAccount();
  await vi.waitFor(() => expect(bridge.request).toHaveBeenCalledOnce());
  stop();
  resolve({
    status: 200,
    data: { region: "cn", environment: "sandbox", backend: "cn-postgres-v1" },
  });
  await new Promise((r) => setTimeout(r, 0));
  expect(client.getCnAccount().config).toBeNull();
  expect(client.getCnAccount().ready).toBe(false);
});
it("a late offline-cache failure after disposal does not overwrite a new lifecycle", async () => {
  vi.stubGlobal("window", new EventTarget());
  let reject!: (error: Error) => void;
  bridge.read.mockImplementationOnce(
    () =>
      new Promise((_, r) => {
        reject = r;
      }),
  );
  const client = await import("./cn-account");
  const stop = client.startCnAccount();
  await vi.waitFor(() => expect(bridge.read).toHaveBeenCalledOnce());
  stop();
  reject(Error("old cache"));
  await new Promise((r) => setTimeout(r, 0));
  expect(client.getCnAccount().error).toBe("");
  expect(bridge.request).not.toHaveBeenCalled();
});
it("monthly membership expires offline at the exact deadline without disabling a separate active trial", async () => {
  vi.useFakeTimers();
  try {
    const now = Date.now(),
      end = now + 30 * 86400000;
    bridge.verify.mockImplementation(async (value) => ({
      envelope: value,
      license: {
        ...license(true, 2),
        v: 2,
        membership_ends_at: end,
        trial_ends_at: end + 86400000,
      },
    }));
    bridge.request.mockResolvedValue({ status: 200, data: { license: {} } });
    const client = await import("./cn-account"),
      access = await import("./access");
    await client.cnAction("/auth/login", {});
    expect(access.memberActive(end - 1)).toBe(true);
    expect(access.memberActive(end)).toBe(false);
    expect(access.accountTrialActive(end)).toBe(true);
    bridge.request.mockRejectedValue(Error("offline"));
    await client.refreshCnAccount();
    expect(access.memberActive(end - 1)).toBe(true);
    await vi.advanceTimersByTimeAsync(30 * 86400000);
    expect(access.memberActive()).toBe(false);
    expect(client.getCnAccount().entitlement?.member).toBe(false);
    expect(access.accountTrialActive()).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});
it("monthly code redemption advertises expiry support and guards the logged in account", async () => {
  const client = await import("./cn-account");
  bridge.request.mockResolvedValue({
    status: 200,
    data: { license: { member: false, revision: 1 } },
  });
  await client.cnAction("/auth/login", {});
  bridge.request.mockResolvedValue({ status: 200, data: { ok: true } });
  await client.cnAction("/codes/redeem", { code: "EXAMPLE" });
  expect(bridge.request).toHaveBeenLastCalledWith(
    "/codes/redeem",
    {
      code: "EXAMPLE",
      supports_monthly: true,
      expected_account_id: "account-a",
    },
    { signal: expect.any(AbortSignal) },
  );
});
it.each([
  { path: "/auth/revoke-session", status: 200 },
  { path: "/trial", status: 409 },
])(
  "a $path response ($status) cannot discard a newer signed membership response",
  async ({ path, status }) => {
    const client = await import("./cn-account");
    bridge.request.mockResolvedValue({
      status: 200,
      data: { license: { member: true, revision: 2 } },
    });
    await client.cnAction("/auth/login", {});
    let finish!: (value: unknown) => void;
    bridge.request.mockImplementation((route: string) =>
      route === "/config"
        ? Promise.resolve({
            status: 200,
            data: {
              region: "cn",
              environment: "sandbox",
              backend: "cn-postgres-v1",
            },
          })
        : route === "/licenses/status"
          ? new Promise((resolve) => {
              finish = resolve;
            })
          : Promise.resolve({
              status,
              data: status === 200 ? { ok: true } : { title: "试用已使用" },
            }),
    );
    const refresh = client.refreshCnAccount();
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    const operation = client.cnAction(path, { session_id: "another-session" });
    if (status === 200) await operation;
    else await expect(operation).rejects.toThrow("试用已使用");
    finish({ status: 200, data: { license: { member: false, revision: 3 } } });
    await refresh;
    expect(client.getCnAccount().license?.revision).toBe(3);
    expect(client.getCnAccount().entitlement?.member).toBe(false);
  },
);
it("logout still revokes the online session and clears the native token if durable storage fails", async () => {
  const client = await import("./cn-account");
  bridge.request.mockResolvedValue({ status: 200, data: { ok: true } });
  bridge.write.mockRejectedValue(Error("storage unavailable"));
  await expect(client.logoutCnAccount()).rejects.toThrow("storage unavailable");
  expect(bridge.request).toHaveBeenCalledWith(
    "/auth/logout",
    {},
    { signal: expect.any(AbortSignal) },
  );
  expect(bridge.clear).toHaveBeenCalledOnce();
  expect(client.getCnAccount().account).toBeNull();
  expect(client.getCnAccount().entitlement).toBeNull();
});
it("service failure remains distinct from a successful response for the wrong account environment", async () => {
  const client = await import("./cn-account");
  bridge.request.mockResolvedValue({
    status: 503,
    data: { title: "测试账号服务暂不可达" },
  });
  await client.refreshCnAccount();
  expect(client.getCnAccount()).toMatchObject({
    offline: true,
    error: "测试账号服务暂不可达",
  });
  bridge.request.mockResolvedValue({
    status: 200,
    data: { region: "global", environment: "live", backend: "wrong" },
  });
  await client.refreshCnAccount();
  expect(client.getCnAccount().error).toBe("国区测试服务配置不匹配");
  bridge.request.mockResolvedValue({
    status: 200,
    data: { region: "cn", environment: "sandbox", backend: "cn-postgres-v1" },
  });
  await client.refreshCnAccount();
  expect(client.getCnAccount()).toMatchObject({ offline: false, error: "" });
});
it("explicit logout completes before bootstrap and drops runtime rights even without network", async () => {
  const client = await import("./cn-account"),
    access = await import("./access");
  access.acceptEntitlement({
    member: true,
    trial_ends_at: null,
    trial_available: false,
    initial_adjustment_until: null,
    initial_adjustment: null,
    valid_until: Date.now() + 60000,
  });
  bridge.request.mockRejectedValue(Error("offline"));
  await client.logoutCnAccount();
  expect(client.getCnAccount()).toMatchObject({
    account: null,
    license: null,
    entitlement: null,
    ready: true,
    error: "",
  });
  expect(access.memberActive()).toBe(false);
  expect(bridge.clear).toHaveBeenCalledOnce();
  expect(JSON.parse(bridge.write.mock.calls.at(-1)![0]).receipt).toBeNull();
});
it("public capabilities arriving after login are retained without consuming stale account results", async () => {
  const client = await import("./cn-account");
  let finish!: (value: unknown) => void;
  bridge.request.mockImplementation((path: string) =>
    path === "/config"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve({
          status: 200,
          data: { license: { member: true, revision: 2 } },
        }),
  );
  const pending = client.refreshCnAccount();
  await client.cnAction("/auth/login", {});
  finish({
    status: 200,
    data: {
      region: "cn",
      environment: "sandbox",
      backend: "cn-postgres-v1",
      account_security_enabled: true,
    },
  });
  await pending;
  expect(client.getCnAccount().config?.account_security_enabled).toBe(true);
  expect(client.getCnAccount().entitlement?.member).toBe(true);
  expect(
    bridge.request.mock.calls.filter((call) => call[0] === "/licenses/status"),
  ).toHaveLength(0);
});
it("a delayed login response cannot restore an account after explicit logout", async () => {
  const client = await import("./cn-account");
  let finish!: (value: unknown) => void;
  bridge.request.mockImplementation((path: string) =>
    path === "/auth/login"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve({ status: 200, data: { ok: true } }),
  );
  const pending = client.cnAction("/auth/login", {});
  await client.logoutCnAccount();
  finish({ status: 200, data: { license: { member: true, revision: 2 } } });
  await expect(pending).rejects.toMatchObject({ kind: "cancelled" });
  expect(client.getCnAccount().account).toBeNull();
  expect(client.getCnAccount().entitlement).toBeNull();
});
it("reading online sessions while a signed membership refresh is pending cannot discard the new grant", async () => {
  const client = await import("./cn-account");
  bridge.request.mockResolvedValue({
    status: 200,
    data: { license: { member: true, revision: 2 } },
  });
  await client.cnAction("/auth/login", {});
  let finish!: (value: unknown) => void;
  bridge.request.mockImplementation((path: string) =>
    path === "/config"
      ? Promise.resolve({
          status: 200,
          data: {
            region: "cn",
            environment: "sandbox",
            backend: "cn-postgres-v1",
            account_security_enabled: true,
          },
        })
      : path === "/licenses/status"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve({ status: 200, data: { sessions: [] } }),
  );
  const pending = client.refreshCnAccount();
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  await client.cnAction("/auth/sessions");
  finish({ status: 200, data: { license: { member: false, revision: 3 } } });
  await pending;
  expect(client.getCnAccount().entitlement?.member).toBe(false);
  expect(client.getCnAccount().license?.revision).toBe(3);
});
it("a known refund cannot be overwritten by a delayed older signed status", async () => {
  const client = await import("./cn-account");
  bridge.request.mockResolvedValue({
    status: 200,
    data: { license: { member: true, revision: 2 } },
  });
  await client.cnAction("/auth/login", {});
  let delayed!: (value: unknown) => void,
    calls = 0;
  bridge.request.mockImplementation((path: string) => {
    if (path === "/config")
      return Promise.resolve({
        status: 200,
        data: {
          region: "cn",
          environment: "sandbox",
          backend: "cn-postgres-v1",
        },
      });
    calls++;
    return calls === 1
      ? new Promise((resolve) => {
          delayed = resolve;
        })
      : Promise.resolve({
          status: 200,
          data: { license: { member: false, revision: 3 } },
        });
  });
  const first = client.refreshCnAccount();
  await vi.waitFor(() => expect(calls).toBe(1));
  await client.refreshCnAccount();
  expect(client.getCnAccount().entitlement?.member).toBe(false);
  delayed({ status: 200, data: { license: { member: true, revision: 2 } } });
  await first;
  expect(client.getCnAccount().entitlement?.member).toBe(false);
  expect(JSON.parse(bridge.write.mock.calls.at(-1)![0]).seen["account-a"]).toBe(
    3,
  );
});
it("a network failure preserves permanent offline membership and a failed durable write discards stale cache", async () => {
  const client = await import("./cn-account");
  bridge.request.mockResolvedValue({
    status: 200,
    data: { license: { member: true, revision: 2 } },
  });
  await client.cnAction("/auth/login", {});
  expect(
    (await import("./access")).memberActive(Date.now() + 35 * 86400000),
  ).toBe(true);
  bridge.request.mockRejectedValue(Error("offline"));
  await client.refreshCnAccount();
  expect(client.getCnAccount().entitlement?.member).toBe(true);
  expect(client.getCnAccount().offline).toBe(true);
  bridge.request.mockResolvedValue({
    status: 200,
    data: { license: { member: false, revision: 3 } },
  });
  bridge.write.mockImplementation(async (value) => {
    if (value) throw Error("disk full");
  });
  await expect(client.cnAction("/licenses/status", {})).rejects.toThrow(
    "disk full",
  );
  expect(client.getCnAccount().entitlement?.member).toBe(false);
  expect(bridge.write).toHaveBeenLastCalledWith("");
});

it("401 preserves signed offline membership and a receipt refresh cannot revive an expired online session", async () => {
  const client = await import("./cn-account");
  bridge.request.mockResolvedValue({
    status: 200,
    data: { license: { member: true, revision: 2 } },
  });
  await client.cnAction("/auth/login", {});
  bridge.request.mockResolvedValueOnce({
    status: 401,
    data: { title: "login required" },
  });
  await expect(client.cnAction("/auth/sessions")).rejects.toMatchObject({
    kind: "session-expired",
    status: 401,
  });
  expect(client.getCnAccount()).toMatchObject({
    sessionExpired: true,
    offline: true,
    entitlement: { member: true },
  });
  await client.cnAction("/licenses/status", {});
  expect(client.getCnAccount()).toMatchObject({
    sessionExpired: true,
    offline: true,
    entitlement: { member: true },
  });
  await client.cnAction("/auth/login", {});
  expect(client.getCnAccount()).toMatchObject({
    sessionExpired: false,
    offline: false,
  });
});
it("refresh checks the online cookie separately from a valid signed receipt", async () => {
  const client = await import("./cn-account");
  bridge.request.mockResolvedValue({
    status: 200,
    data: { license: { member: true, revision: 2 } },
  });
  await client.cnAction("/auth/login", {});
  bridge.request.mockImplementation(async (path: string) => ({
    status: 200,
    data:
      path === "/config"
        ? { region: "cn", environment: "sandbox", backend: "cn-postgres-v1" }
        : path === "/me"
          ? { account: null, license: null }
          : { license: { member: true, revision: 2 } },
  }));
  await client.refreshCnAccount();
  expect(client.getCnAccount()).toMatchObject({
    sessionExpired: true,
    offline: true,
    entitlement: { member: true },
  });
});
it("old non-license responses and cancelled signature checks cannot publish or return data", async () => {
  const client = await import("./cn-account");
  let finish!: (value: unknown) => void;
  bridge.request.mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const old = client.cnAction("/auth/sessions");
  bridge.request.mockResolvedValue({
    status: 200,
    data: { license: { member: true, revision: 2 } },
  });
  await client.cnAction("/auth/login", {});
  finish({ status: 200, data: { sessions: [{ id: "old" }] } });
  await expect(old).rejects.toMatchObject({ kind: "cancelled" });
  const controller = new AbortController();
  bridge.verify.mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const grant = client.cnAction(
    "/licenses/status",
    {},
    { signal: controller.signal },
  );
  await vi.waitFor(() => expect(bridge.verify).toHaveBeenCalledTimes(2));
  const writes = bridge.write.mock.calls.length;
  controller.abort();
  finish({ envelope: {}, license: license(false, 3) });
  await expect(grant).rejects.toMatchObject({ kind: "cancelled" });
  expect(client.getCnAccount().entitlement?.member).toBe(true);
  expect(bridge.write).toHaveBeenCalledTimes(writes);
});
it("an old logout cannot clear the native cookie after a newer login", async () => {
  const client = await import("./cn-account");
  let finish!: (value: unknown) => void;
  bridge.request.mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const old = client.logoutCnAccount();
  await vi.waitFor(() => expect(bridge.request).toHaveBeenCalledOnce());
  bridge.request.mockResolvedValue({
    status: 200,
    data: { license: { member: true, revision: 2 } },
  });
  await client.cnAction("/auth/login", {});
  finish({ status: 200, data: { ok: true } });
  await old;
  expect(bridge.clear).not.toHaveBeenCalled();
  expect(client.getCnAccount().account?.id).toBe("account-a");
});
it("a different signed subject from the cookie probe cannot replace the offline identity", async () => {
  const client = await import("./cn-account");
  bridge.request.mockResolvedValue({
    status: 200,
    data: { license: { member: true, revision: 2 } },
  });
  await client.cnAction("/auth/login", {});
  bridge.verify.mockResolvedValueOnce({
    envelope: {},
    license: { ...license(true, 3), sub: "account-b" },
  });
  await expect(client.cnAction("/me")).rejects.toMatchObject({
    status: 409,
    details: { code: "account_changed" },
  });
  expect(client.getCnAccount().account?.id).toBe("account-a");
});
it("a wrong current password is not mistaken for an expired cookie, and the POST is not retried", async () => {
  const client = await import("./cn-account");
  bridge.request.mockResolvedValue({
    status: 200,
    data: { license: { member: true, revision: 2 } },
  });
  await client.cnAction("/auth/login", {});
  bridge.request
    .mockResolvedValueOnce({ status: 401, data: { title: "当前密码不正确" } })
    .mockResolvedValueOnce({
      status: 200,
      data: { account: { id: "account-a" } },
    });
  await expect(
    client.cnAction("/auth/change-password", {
      current_password: "wrong",
      new_password: "example",
    }),
  ).rejects.toMatchObject({ status: 401, kind: "http" });
  expect(client.getCnAccount()).toMatchObject({
    sessionExpired: false,
    offline: false,
    entitlement: { member: true },
  });
  expect(
    bridge.request.mock.calls.filter((c) => c[0] === "/auth/change-password"),
  ).toHaveLength(1);
});
it("a valid CN receipt after a network failure does not establish online availability", async () => {
  const client = await import("./cn-account");
  bridge.request.mockResolvedValue({
    status: 200,
    data: { license: { member: true, revision: 2 } },
  });
  await client.cnAction("/auth/login", {});
  bridge.request.mockRejectedValueOnce(Error("offline"));
  await client.refreshCnAccount();
  expect(client.getCnAccount()).toMatchObject({
    offline: true,
    sessionExpired: false,
  });
  await client.cnAction("/licenses/status", {});
  expect(client.getCnAccount()).toMatchObject({
    offline: true,
    sessionExpired: false,
    entitlement: { member: true },
  });
});
