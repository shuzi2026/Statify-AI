import { z } from "zod";
import catalog from "../../shared/feature-poll.json";
import { paymentRequest } from "./transport";
export { catalog as featurePoll };
const optionIds = new Set(catalog.options.map((option) => option.id));
const option = z.object({
  id: z.string().refine((id) => optionIds.has(id)),
  votes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  upvoted: z.boolean(),
});
const schema = z
  .object({
    id: z.literal("v023"),
    account_id: z.uuid(),
    selections: z.array(z.string()),
    total_votes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    options: z.array(option).length(catalog.options.length),
  })
  .refine(
    (data) =>
      new Set(data.options.map((item) => item.id)).size ===
        catalog.options.length &&
      data.options.reduce((sum, item) => sum + item.votes, 0) ===
        data.total_votes &&
      new Set(data.selections).size === data.selections.length &&
      data.selections.length ===
        data.options.filter((item) => item.upvoted).length &&
      data.selections.every((id) =>
        data.options.some(
          (item) => item.id === id && item.upvoted && item.votes > 0,
        ),
      ),
  );
export type FeatureVote = z.infer<typeof schema>;
export class VoteError extends Error {
  constructor(
    message: string,
    public loginRequired = false,
  ) {
    super(message);
  }
}
export async function requestFeatureVote(
  accountId: string,
  optionId?: string,
  active = true,
): Promise<FeatureVote> {
  if (
    optionId !== undefined &&
    (!optionIds.has(optionId) ||
      (active &&
        catalog.options.find((option) => option.id === optionId)?.status ===
          "completed"))
  )
    throw new VoteError("请选择列表中的一项功能");
  const { status, data } = await paymentRequest(
    "/feature-polls/v023" +
      (optionId === undefined ? "" : "/votes") +
      "?catalog=2",
    optionId === undefined
      ? undefined
      : { option_id: optionId, active, expected_account_id: accountId },
  );
  if (status === 401) throw new VoteError("请联网登录后再投票。", true);
  if (status === 409) throw new VoteError("登录账号已改变，请重新登录。", true);
  if (status !== 200)
    throw new VoteError(
      status === 429
        ? "操作较频繁，请稍后重试。"
        : "投票服务暂未连接，请重试。",
    );
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new VoteError("投票结果无法读取，请重试。");
  if (parsed.data.account_id !== accountId)
    throw new VoteError("登录账号已改变，请重新登录。", true);
  return parsed.data;
}
