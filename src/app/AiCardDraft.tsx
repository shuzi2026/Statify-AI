import type { AiCardProposal } from "../../shared/ai-chat";
import { attrAllowed, growth, statusValue } from "../engine";
import { methodNames, statusNames, type State } from "../model";
import { ruleContext } from "../payments/access";

export function availableDraftRewards(proposal: AiCardProposal, state: State, now: number) {
  const context = ruleContext(now);
  return proposal.rewards.flatMap((reward) => {
    const attribute = state.attributes.find((item) => item.id === reward.id);
    return attribute && attrAllowed(state, attribute, context) ? [{ reward, attribute }] : [];
  });
}

export function AiCardDraft({ proposal, state, now, busy, confirm, cancel }: {
  proposal: AiCardProposal;
  state: State;
  now: number;
  busy: boolean;
  confirm: () => void;
  cancel: () => void;
}) {
  const rewards = availableDraftRewards(proposal, state, now);
  const unit = proposal.method === "timed" ? "每分钟" : "每次完成";
  return (
    <section className="ai-card-draft" aria-labelledby="ai-card-draft-title">
      <h2 id="ai-card-draft-title">卡牌草稿</h2>
      <strong>{proposal.name}</strong>
      <p>{proposal.category || "未分类"} · {methodNames[proposal.method]}{proposal.minutes !== null && <> · {proposal.minutes} {"分钟"}</>}</p>
      {(rewards.length > 0 || proposal.effects.length > 0) && (
        <>
          <p className="ai-card-draft-unit">{"建议结算值"} · {unit}</p>
          <dl>
            {rewards.map(({ reward, attribute }) => (
              <div key={reward.id}>
                <dt>{attribute.name} · Lv. {growth(attribute).level}</dt>
                <dd>+{reward.amount} XP</dd>
              </div>
            ))}
            {proposal.effects.map(({ id, amount }) => (
              <div key={id}>
                <dt>{statusNames[id]} · {"当前"} {statusValue(state, id, now)}</dt>
                <dd>{amount > 0 ? "+" : ""}{amount}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      <p className="ai-card-draft-unit">你可以在聊天里修改草稿，或确认创建卡牌。</p>
      <div className="ai-card-draft-actions">
        <button type="button" disabled={busy} onClick={cancel}>取消草稿</button>
        <button type="button" className="primary" disabled={busy} onClick={confirm}>创建卡牌</button>
      </div>
    </section>
  );
}
