import { beforeEach, expect, it, vi } from "vitest";
import { featurePoll, requestFeatureVote, VoteError } from "./feature-votes";
const request = vi.hoisted(() => vi.fn());
vi.mock("./transport", () => ({ paymentRequest: request }));
const account = "11111111-1111-4111-8111-111111111111";
const response = () => ({
  ...featurePoll,
  account_id: account,
  selections: [],
  total_votes: 0,
  options: featurePoll.options.map((item) => ({
    ...item,
    votes: 0,
    upvoted: false,
  })),
});
beforeEach(() => request.mockReset());
it("cannot add support to a completed choice, while historical cancellation remains valid", async () => {
  await expect(requestFeatureVote(account, "plan-card-ui")).rejects.toBeInstanceOf(VoteError);
  expect(request).not.toHaveBeenCalled();
  request.mockResolvedValue({ status: 200, data: response() });
  await requestFeatureVote(account, "plan-card-ui", false);
  expect(request).toHaveBeenCalledTimes(1);
});
it("uses online transport with an explicit account guard and never changes membership state", async () => {
  request.mockResolvedValue({ status: 200, data: response() });
  await requestFeatureVote(account);
  expect(request).toHaveBeenLastCalledWith(
    "/feature-polls/v023?catalog=2",
    undefined,
  );
  await requestFeatureVote(account, "custom-themes");
  expect(request).toHaveBeenLastCalledWith(
    "/feature-polls/v023/votes?catalog=2",
    { option_id: "custom-themes", active: true, expected_account_id: account },
  );
  await requestFeatureVote(account, "custom-themes", false);
  expect(request).toHaveBeenLastCalledWith(
    "/feature-polls/v023/votes?catalog=2",
    { option_id: "custom-themes", active: false, expected_account_id: account },
  );
});
it("requires online login even when an offline license exists", async () => {
  request.mockResolvedValue({ status: 401, data: {} });
  await expect(requestFeatureVote(account)).rejects.toMatchObject({
    loginRequired: true,
  });
});
it("rejects a stale result belonging to a different account", async () => {
  request.mockResolvedValue({
    status: 200,
    data: { ...response(), account_id: "22222222-2222-4222-8222-222222222222" },
  });
  await expect(requestFeatureVote(account)).rejects.toMatchObject({
    loginRequired: true,
  });
});
it("rejects duplicate choices, invalid counts and malformed totals instead of showing false results", async () => {
  for (const value of [
    { ...response(), options: Array(6).fill(response().options[0]) },
    { ...response(), total_votes: 10 },
    { ...response(), selections: ["unknown"] },
  ]) {
    request.mockResolvedValue({ status: 200, data: value });
    await expect(requestFeatureVote(account)).rejects.toThrow(
      "投票结果无法读取",
    );
  }
});
it("rejects an unknown choice locally and reports server failure without claiming a saved vote", async () => {
  await expect(requestFeatureVote(account, "unknown")).rejects.toBeInstanceOf(
    VoteError,
  );
  expect(request).not.toHaveBeenCalled();
  request.mockResolvedValue({ status: 503, data: {} });
  await expect(requestFeatureVote(account, "custom-themes")).rejects.toThrow(
    "暂未连接",
  );
});
