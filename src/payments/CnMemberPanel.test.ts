import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fresh } from "../model";
const mock = vi.hoisted(() => ({
  member: false,
  monthly: false,
  action: vi.fn(),
  account: {
    id: "test-account",
    email: "isolated@example.test",
    character_id: "test-character",
    character_nickname: "kk",
  },
}));
vi.mock("./cn-account", () => ({
  useCnAccount: () => ({
    account: mock.account,
    entitlement: { trial_available: true },
    config: {
      account_security_enabled: true,
      alipay_environment: "sandbox",
      alipay_channels: ["web"],
      alipay_offer: {
        amount: "20.00",
        subject: "Statify test membership",
        terms_version: "sandbox-v1",
      },
    },
    offline: false,
    error: "",
    license: mock.monthly
      ? { v: 2, membership_ends_at: Date.now() + 86400000 }
      : null,
  }),
  cnAction: mock.action,
  refreshCnAccount: vi.fn(),
  logoutCnAccount: vi.fn(),
}));
vi.mock("./access", () => ({
  memberActive: () => mock.member,
  accountTrialActive: () => false,
}));
vi.mock("../components", () => ({
  Field: ({ label, children }: { label: string; children: ReactNode }) =>
    createElement("label", null, label, children),
}));
vi.mock("./AccountSecurityPanel", () => ({
  AccountSecurityPanel: () =>
    createElement("div", { "data-account-security": true }),
}));
import { CnMemberPanel } from "./CnMemberPanel";
beforeEach(() => {
  mock.member = false;
  mock.monthly = false;
  mock.action.mockClear();
});
function page(target: "account" | "trial" | "code" | "purchase") {
  const s = fresh(Date.now(), "cn");
  s.profile.onboarded = true;
  return renderToStaticMarkup(
    createElement(CnMemberPanel, { s, run: async () => true, target }),
  );
}
describe("independent CN membership pages", () => {
  it("offers permanent purchase to monthly members but not permanent members", () => {
    mock.member = true;
    mock.monthly = true;
    expect(page("purchase")).toContain("购买永久会员");
    expect(page("purchase")).toContain('type="checkbox"');
    mock.monthly = false;
    expect(page("purchase")).not.toContain('type="checkbox"');
  });
  it("keeps account identity and security separate from trial and redemption", () => {
    const html = page("account");
    expect(html).toContain("<dt>登录邮箱</dt>");
    expect(html).toContain("data-account-security");
    expect(html).not.toContain('id="cn-trial"');
    expect(html).not.toContain('id="cn-code"');
  });
  it("shows only the trial action on the trial page", () => {
    const html = page("trial");
    expect(html).toContain("开启7天试用");
    expect(html).not.toContain("激活码");
    expect(html).not.toContain("data-account-security");
    expect(html).not.toContain("账号角色：");
  });
  it("shows only activation on the code page", () => {
    const html = page("code");
    expect(html).toContain("兑换并绑定当前账号");
    expect(html).toContain("激活码");
    expect(html).not.toContain("开启7天试用");
    expect(html).not.toContain("data-account-security");
  });
  it("does not invite an existing member to consume a trial or another code", () => {
    mock.member = true;
    expect(page("trial")).not.toContain('id="cn-trial"');
    expect(page("code")).not.toContain('id="cn-code"');
    expect(mock.action).not.toHaveBeenCalled();
  });
});
