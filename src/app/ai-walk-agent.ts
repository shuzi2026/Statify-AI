import type { WalkChatPhase } from "../../shared/ai-chat";
import type { SaveScope, SaveSnapshot } from "../save-publication";

export type WalkSession = { scope: SaveScope; actionId: string; chinese: boolean };

export function walkPhase(session: WalkSession | undefined, snapshot: SaveSnapshot | null): WalkChatPhase | undefined {
  if (!session || session.scope !== snapshot?.scope) return;
  if (snapshot.state.entries.some(({ id }) => id === session.actionId)) return "reflection";
  if (snapshot.state.actions.some(({ id, endedAt }) => id === session.actionId && endedAt === null))
    return "walking";
}

export const isWalkingCard = (name: string) => /散步|出去走走|\bwalk(?:ing)?\b/i.test(name);
export const skipsWalkReflection = (message: string) =>
  /^(?:跳过(?:感悟)?|不用(?:了|记了)?|不写了|算了|skip(?: it)?|no thanks|no thank you|not now)[。.!！\s]*$/i.test(message);
