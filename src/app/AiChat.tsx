import { useEffect, useLayoutEffect, useRef, useState, type SetStateAction } from "react";
import { MessageSquare, Plus, Terminal } from "lucide-react";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import {
  AI_CHAT_DEVELOPER_PATH,
  AI_CHAT_DEVELOPER_SESSION_PATH,
  AI_CHAT_INPUT_LIMIT,
  AI_CHAT_PATH,
  AI_CHAT_STREAM,
  aiOperation,
  developerUnlockPrompt,
  recentAiChatMessages,
  type AiCardProposal,
  type AiChatMessage,
  type DeveloperThread,
} from "../../shared/ai-chat";
import { DeveloperChangeReview } from "./DeveloperChangeReview";
import { DISH_SOAP_CARD, shoppingComparison, shoppingPrice, type ShoppingComparison } from "../../shared/shopping-demo";
import { ChatLink, ChatText, chatLinks } from "./ai-chat-links";
import { readChatReply } from "./ai-chat-stream";
import { AiReadLoopError, continueLocalReads } from "./ai-read-loop";
import { readChatVoice, rememberChatVoice } from "./chat-voice";
import { readChatHistory, saveChatHistory } from "./chat-history";
import { isHackathonPreview } from "../payments/preview-access";
import { newCard, type Action, type Card, type State } from "../model";
import { elapsed } from "../engine";
import { timeText } from "../components";
import { saveSnapshot, type SaveScope } from "../save-publication";
import { checkCardPrintBudget } from "../ui-layout/text-budget";
import { AiCardDraft, availableDraftRewards } from "./AiCardDraft";
import { prepareAiExistingOperation, resolveAiCategory } from "./ai-local-operation";
import { readActivity } from "./ai-activity";
import { applyAiActivity } from "./ai-activity-actions";
import { applyAiProfile } from "./ai-profile";
import { applyAiManagement } from "./ai-management";
import { skipsWalkReflection, walkPhase, type WalkSession } from "./ai-walk-agent";
import { useActionTime } from "./useViewTime";
import type { Actions, Modal } from "./types";
import "./ai-chat.css";

const chatErrors: Record<string, string> = {
  missing_key: "请先在本地开发服务配置 OpenAI 项目密钥。",
  invalid_key: "OpenAI 拒绝了项目密钥，请检查本地配置。",
  model_unavailable: "当前 OpenAI 项目无法使用所选模型。",
  quota: "OpenAI API 额度不足，请检查项目所属组织的账单。",
  rate_limit: "OpenAI 请求过于频繁，请稍后再试。",
  visitor_daily_limit: "今天的 AI 消息额度已用完。请在 UTC 午夜重置后再试。",
  ai_spend_limit: "AI 已达到参赛演示的用量上限。",
  busy: "已有一条消息在等待回复，请稍后再试。",
  timeout: "等待 OpenAI 回复超时，请重试。",
  memory_unavailable: "暂时无法访问已保存的偏好，请重试。",
  empty_reply: "OpenAI 没有返回可显示的文字，请重试。",
  invalid_operation: "AI 返回了无效的卡牌操作，请重试。",
  upstream: "暂时无法获取 OpenAI 回复，请重试。",
  read_session_expired: "查询会话已过期，请重新发送问题。",
  developer_unconfigured: "本地开发口令尚未配置。",
  developer_invalid_passphrase: "开发口令不正确，请重试。",
  developer_locked: "开发会话已过期，请重新解锁。",
  developer_busy: "OpenCode 正在处理另一项开发任务，请稍后再试。",
  developer_engine_unavailable: "无法启动 OpenCode，请检查本地依赖后重试。",
  developer_engine: "OpenCode 未能完成请求，请重试。",
  developer_timeout: "OpenCode 开发任务超时，请先查看对话和工作区中的进度。",
  developer_thread: "找不到这条开发对话，请重新解锁。",
  credential_in_chat: "检测到本地密钥。请使用专用的开发口令输入框。",
  session_required: "访客会话已过期，请刷新页面后重试。",
};

const chatEnabled = import.meta.env.DEV || isHackathonPreview();

const toolLabels: Record<string, string> = {
  glob: "列文件",
  grep: "搜代码",
  read: "读文件",
  edit: "编辑文件",
  write: "写入文件",
  apply_patch: "应用补丁",
  todowrite: "安排任务",
};

type ChatConnection = "checking" | "unavailable" | "unconfigured" | { model: string; memory: boolean };
type UserChatMessage = AiChatMessage & {
  local?: { scope: SaveScope; context: string; chinese: boolean };
  comparison?: ShoppingComparison;
};
type UserConversation = {
  messages: UserChatMessage[];
  draft: string;
  proposal?: { card: AiCardProposal; scope: SaveScope };
  walk?: WalkSession;
};
const emptyConversation = (): UserConversation => ({ messages: [], draft: "" });

function ChatTimer({ action, open }: { action: Action; open: () => void }) {
  const now = useActionTime(action.runningSince !== null);
  return <button type="button" onClick={open}>
    {"返回计时"} · {timeText(elapsed(action, now))}
  </button>;
}

export function AiChat({ compact = false, openShoppingCard, openComparison, openEditor, saveCard, runAiAction, present, chatTimer, returnToTimer, openWalkInChat, state, now }: {
  compact?: boolean;
  openShoppingCard?: () => void;
  openComparison?: (comparison: ShoppingComparison) => void;
  openEditor: (modal: Modal) => void;
  saveCard: (card: Card) => Promise<boolean>;
  runAiAction: Actions["runAiAction"];
  present: Actions["present"];
  chatTimer?: Action;
  returnToTimer: () => void;
  openWalkInChat: (actionId: string) => void;
  state: State;
  now: number;
}) {
  const [restoredHistory] = useState(() => readChatHistory(state));
  const [conversations, setConversations] = useState<UserConversation[]>(restoredHistory.conversations);
  const [conversation, setConversation] = useState(restoredHistory.conversation);
  const [developerDraft, setDeveloperDraft] = useState("");
  const [developerMessages, setDeveloperMessages] = useState<AiChatMessage[]>([]);
  const [developerToken, setDeveloperToken] = useState<string>();
  const [developerConfigured, setDeveloperConfigured] = useState(false);
  const [, setDeveloperModel] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [threads, setThreads] = useState<DeveloperThread[]>([]);
  const [thread, setThread] = useState("");
  const [mode, setMode] = useState<"plan" | "build">("build");
  const [openingThread, setOpeningThread] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [passphrasePrompt, setPassphrasePrompt] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [toolsUsed, setToolsUsed] = useState<string[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [streamed, setStreamed] = useState("");
  const [searching, setSearching] = useState(false);
  const [reading, setReading] = useState(false);
  const [savingProposal, setSavingProposal] = useState(false);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState<ChatConnection>(
    chatEnabled ? "checking" : "unavailable",
  );
  const transcript = useRef<HTMLDivElement>(null);
  const followStream = useRef(true);
  const input = useRef<HTMLTextAreaElement>(null);
  const { messages: userMessages, draft: userDraft, proposal, walk } = conversations[conversation];
  const draft = developerToken ? developerDraft : userDraft;
  const messages = developerToken ? developerMessages : userMessages;
  const phase = !developerToken ? walkPhase(walk, saveSnapshot()) : undefined;
  const switchingBlocked = !!pending || openingThread || savingProposal || unlocking || !!passphrasePrompt || reviewOpen;

  useEffect(() => {
    if (!saveChatHistory(state, { conversations, conversation }))
      setError("浏览器暂时无法保存聊天记录，请保留当前页面。");
  }, [conversations, conversation, state.createdAt, state.region]);

  function updateConversation(update: (current: UserConversation) => UserConversation) {
    setConversations((current) => current.map((item, i) => i === conversation ? update(item) : item));
  }
  function setDraft(value: string) {
    if (developerToken) setDeveloperDraft(value);
    else updateConversation((current) => ({ ...current, draft: value }));
  }
  function setUserMessages(next: SetStateAction<UserChatMessage[]>) {
    updateConversation((current) => ({ ...current, messages: typeof next === "function" ? next(current.messages) : next }));
  }
  function setProposal(next: UserConversation["proposal"]) {
    updateConversation((current) => ({ ...current, proposal: next }));
  }
  function setWalk(next: UserConversation["walk"]) {
    setConversations((current) => current.map((item, i) => {
      if (i === conversation) return { ...item, walk: next };
      if (next && item.walk?.scope === next.scope && item.walk.actionId === next.actionId)
        return { ...item, walk: undefined };
      return item;
    }));
  }
  function selectConversation(index: number) {
    if (switchingBlocked) return;
    if (index === conversations.length) setConversations((current) => [...current, emptyConversation()]);
    setConversation(index);
    setError("");
  }

  useEffect(() => {
    if (!chatEnabled) return;
    const controller = new AbortController();
    fetch(AI_CHAT_PATH, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("AI chat endpoint unavailable");
        const status = await response.json();
        setDeveloperConfigured(status.developerConfigured === true);
        setConnection(status.configured && typeof status.model === "string"
          ? { model: status.model, memory: status.memoryEnabled === true }
          : "unconfigured");
      })
      .catch(() => {
        if (!controller.signal.aborted) setConnection("unavailable");
      });
    return () => controller.abort();
  }, []);

  useLayoutEffect(() => {
    const log = transcript.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, pending, error, passphrasePrompt, proposal, phase]);
  useLayoutEffect(() => {
    const log = transcript.current;
    if (log && followStream.current) log.scrollTop = log.scrollHeight;
  }, [streamed, searching]);

  const canSend = !pending && !savingProposal && !openingThread && !!draft.trim() &&
    (!!developerToken || typeof connection === "object" ||
      (developerConfigured && !!developerUnlockPrompt(draft)));

  async function unlock(passphrase: string) {
    setUnlocking(true);
    setError("");
    try {
      const response = await fetch(AI_CHAT_DEVELOPER_SESSION_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });
      const result = await response.json();
      if (!response.ok || typeof result.token !== "string") {
        setError(chatErrors[result.error] ?? chatErrors.upstream);
        return;
      }
      setDeveloperToken(result.token);
      setDeveloperModel(result.model);
      setWorkspace(result.workspace);
      setThreads(result.threads);
      setThread(result.thread ?? "");
      setDeveloperMessages(result.messages);
      setPassphrasePrompt(null);
    } catch {
      setError(chatErrors.upstream);
    } finally {
      setUnlocking(false);
    }
  }

  function clearDeveloperChat() {
    setDeveloperToken(undefined);
    setDeveloperMessages([]);
    setThreads([]);
    setThread("");
    setWorkspace("");
    setMode("build");
    setReviewOpen(false);
    setToolsUsed([]);
    setDeveloperDraft("");
    setError("");
  }

  function handleDeveloperLock() {
    clearDeveloperChat();
    setPassphrasePrompt("请输入密钥");
    setError(chatErrors.developer_locked);
  }

  async function openThread(action: { action: "new" } | { action: "open"; thread: string }) {
    if (!developerToken || openingThread || pending) return;
    setOpeningThread(true);
    setError("");
    try {
      const response = await fetch(AI_CHAT_DEVELOPER_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${developerToken}` },
        body: JSON.stringify(action),
      });
      const result = await response.json();
      if (response.ok) {
        setDeveloperMessages(result.messages);
        setThread(result.thread);
        setThreads(result.threads);
        setToolsUsed([]);
        setDeveloperDraft("");
      } else if (result.error === "developer_locked") {
        handleDeveloperLock();
      } else {
        setError(chatErrors[result.error] ?? chatErrors.developer_engine);
      }
    } catch {
      setError(chatErrors.developer_engine);
    } finally {
      setOpeningThread(false);
    }
  }

  function lock() {
    if (!developerToken) return;
    void fetch(AI_CHAT_DEVELOPER_SESSION_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${developerToken}` },
      body: "{}",
    }).catch(() => undefined);
    clearDeveloperChat();
  }

  async function confirmProposal() {
    if (!proposal || pending || savingProposal) return;
    const { card, scope } = proposal;
    const snapshot = saveSnapshot();
    if (!snapshot || snapshot.scope !== scope) {
      setProposal(undefined);
      setError("存档已更新，请重新生成卡牌草稿。");
      return;
    }
    setSavingProposal(true);
    setError("");
    try {
      checkCardPrintBudget(card.name);
      const at = Date.now();
      const defaults = newCard(at);
      const saved = await saveCard({
        ...defaults,
        name: card.name,
        category: resolveAiCategory(card.category, snapshot.state),
        method: card.method,
        minutes: card.minutes ?? defaults.minutes,
        rewards: availableDraftRewards(card, snapshot.state, at).map(({ reward }) => reward),
        effects: card.effects,
      });
      if (!saved) {
        setError("卡牌未保存，请检查后重试。");
        return;
      }
      const chinese = /[\u3400-\u9fff]/.test(card.reason);
      setUserMessages((history) => [...history,
        { role: "user", content: chinese ? "确认创建这张卡牌。" : "Create this card." },
        { role: "assistant", content: chinese ? `已创建「${card.name}」。` : `I created “${card.name}”.` },
      ]);
      setProposal(undefined);
    } catch (error) {
      setError(error instanceof Error ? error.message : chatErrors.invalid_operation);
    } finally {
      setSavingProposal(false);
    }
  }

  async function send() {
    if (!canSend) return;
    const content = draft.trim();
    const prompt = developerToken ? null : developerUnlockPrompt(content);
    if (prompt) {
      setDraft("");
      setError("");
      setPassphrasePrompt(prompt);
      return;
    }
    const next: UserChatMessage[] = [...messages, { role: "user", content }];
    const scope = saveSnapshot()?.scope;
    if (phase === "reflection" && walk && skipsWalkReflection(content)) {
      setWalk(undefined);
      setDraft("");
      setError("");
      setUserMessages([...next, { role: "assistant", content: walk.chinese ? "已跳过这次感悟。" : "I skipped the reflection." }]);
      return;
    }
    const activeProposal = proposal?.scope === scope ? proposal?.card : undefined;
    const outgoing = next.map(({ role, content, local, comparison }) => ({
      role,
      content: local?.context ?? (comparison ? [content, ...comparison.offers.map(({ productTitle, merchant, cents }) =>
        `${productTitle} · ${merchant} · ${shoppingPrice(cents)}`)].join("\n") : content),
    }));
    if (activeProposal && outgoing.length > 1 && !developerToken)
      outgoing[outgoing.length - 2].content += `\nCurrent unconfirmed draft: ${JSON.stringify(activeProposal)}`;
    setPending(content);
    followStream.current = true;
    setDraft("");
    setError("");
    if (developerToken) setToolsUsed([]);
    input.current?.focus();
    const chat = recentAiChatMessages(outgoing);
    const voice = developerToken ? undefined : readChatVoice(state, content);

    try {
      const response = await fetch(developerToken ? AI_CHAT_DEVELOPER_PATH : AI_CHAT_PATH, {
        method: "POST",
        headers: developerToken
          ? { "Content-Type": "application/json", Authorization: `Bearer ${developerToken}` }
          : { "Content-Type": "application/json", Accept: AI_CHAT_STREAM },
        body: JSON.stringify(developerToken ? { content, mode } : { messages: chat, walkPhase: phase, voice }),
      });
      const initial = await readChatReply(response,
        (delta) => setStreamed((text) => text + delta),
        () => { setSearching(true); setStreamed(""); });
      const { ok, result, local: readEvidence } = await continueLocalReads(initial, {
        scope, current: saveSnapshot, chinese: /[\u3400-\u9fff]/.test(content),
        onRead: () => { setSearching(false); setReading(true); setStreamed(""); },
        send: async (body) => {
          const response = await fetch(AI_CHAT_PATH, { method: "POST",
            headers: { "Content-Type": "application/json", Accept: AI_CHAT_STREAM }, body: JSON.stringify(body) });
          return readChatReply(response, (delta) => setStreamed((text) => text + delta), () => {});
        },
      });
      setStreamed("");
      if (ok && !developerToken && scope === saveSnapshot()?.scope) rememberChatVoice(state, content);
      if (ok && !developerToken && Object.hasOwn(result, "operation")) {
        const operation = aiOperation.safeParse(result.operation).data;
        if (!operation) {
          setError(chatErrors.invalid_operation);
          setDraft(content);
          return;
        }

        const current = saveSnapshot();
        if (!scope || scope !== current?.scope) {
          setError("存档已更新，请重新发送请求。");
          setDraft(content);
          return;
        }
        const chinese = /[\u3400-\u9fff]/.test(content);
        let reply: string;
        let local: UserChatMessage["local"];
        try {
          if (operation.type === "propose_card") {
            const category = resolveAiCategory(operation.category, current.state);
            reply = operation.reason;
            if (chinese !== /[\u3400-\u9fff]/.test(reply)) {
              reply = chinese ? "请核对草稿里的分类、时长和结算设置。" : "Review the category, timing, and rewards in the draft.";
            }
            setProposal({ card: { ...operation, category, reason: reply }, scope });
          } else if (operation.type === "read_activity") {
            const records = readActivity(current.state, operation, Date.now(), chinese);
            reply = records.count ? records.page(operation.offset ?? 0, 10).join("\n\n") :
              chinese ? "没有找到符合条件的记录。" : "No matching records.";
            local = { scope, chinese, context: reply };
          } else if (operation.type === "read_profile" || operation.type === "edit_profile") {
            local = { scope, chinese, context: "The profile request was handled locally." };
            reply = await applyAiProfile(operation, current, chinese);
          } else if (operation.type === "start_card" || operation.type === "record_card" || operation.type === "append_journal_note") {
            local = { scope, chinese, context: "The activity request was handled in the browser." };
            const outcome = await applyAiActivity(operation, current, runAiAction, chinese, {
              actionId: phase === "walking" ? walk?.actionId : undefined,
              entryId: phase === "reflection" ? walk?.actionId : undefined,
              onStart: openWalkInChat,
            });
            reply = typeof outcome === "string" ? outcome : outcome.reply;
            if (typeof outcome !== "string") {
              local.context = outcome.context ?? local.context;
              if (outcome.walkId) setWalk({ scope, actionId: outcome.walkId, chinese });
              if (outcome.reflectionFinished) setWalk(undefined);
            }
          } else if (operation.type === "edit_card" || operation.type === "adjust_status" || operation.type === "adjust_initial_levels") {
            openEditor(prepareAiExistingOperation(operation, current.state, Date.now()));
            setProposal(undefined);
            reply = chinese ? "我已在表单里填好建议，请核对后保存。" : "I filled in the suggested changes. Review them in the form before saving.";
          } else {
            local = { scope, chinese, context: "The requested local operation was handled in the browser." };
            reply = await applyAiManagement(operation, current, present, openEditor, chinese);
            setProposal(undefined);
          }
        } catch (error) {
          const explanation = error instanceof Error ? error.message : chatErrors.invalid_operation;
          setUserMessages([...next, { role: "assistant", content: explanation, local }]);
          return;
        }
        setUserMessages([...next, { role: "assistant", content: reply, local }]);
      } else if (ok && typeof result.reply === "string") {
        const setMessages = developerToken ? setDeveloperMessages : setUserMessages;
        const comparison = !developerToken && scope === saveSnapshot()?.scope
          ? shoppingComparison.safeParse(result.comparison).data : undefined;
        setMessages([...next, { role: "assistant", content: result.reply, ...(readEvidence && { local: readEvidence }), ...(comparison && { comparison }) }]);
        if (comparison) openComparison?.(comparison);
        if (!developerToken && result.openShoppingCard === DISH_SOAP_CARD) openShoppingCard?.();
        if (developerToken) {
          setThread(result.thread);
          setThreads(result.threads);
          setToolsUsed(Array.isArray(result.toolsUsed)
            ? result.toolsUsed.filter((name: string) => Object.prototype.hasOwnProperty.call(toolLabels, name))
            : []);
        }
      } else if (result.error === "developer_locked") {
        handleDeveloperLock();
      } else {
        setError(chatErrors[result.error] ?? chatErrors.upstream);
        if (result.error !== "credential_in_chat") setDraft(content);
      }
    } catch (error) {
      setError(error instanceof AiReadLoopError ? error.message : chatErrors.upstream);
      setDraft(content);
    } finally {
      setStreamed("");
      setSearching(false);
      setReading(false);
      setPending(null);
    }
  }

  return (
    <div className="workspace-card-layout ai-chat-workspace">
    <aside className="workspace-categories workspace-scroll-area ai-chat-rail">
      <nav aria-label="对话列表">
        <button type="button" className="ai-chat-new" aria-label={developerToken ? "新建开发对话" : "新建对话"}
          title={developerToken ? "新建开发对话" : "新建对话"} disabled={switchingBlocked}
          onClick={() => developerToken ? void openThread({ action: "new" }) : selectConversation(conversations.length)}>
          <Plus size={20} aria-hidden="true" />
        </button>
        {developerToken ? threads.map(({ id, title }) => (
          <button type="button" key={id} title={title} aria-pressed={thread === id}
            disabled={switchingBlocked} onClick={() => void openThread({ action: "open", thread: id })}>
            {title}
          </button>
        )) : conversations.map((_, index) => (
          <button type="button" key={index} aria-pressed={conversation === index}
            disabled={switchingBlocked} onClick={() => selectConversation(index)}>
            {"对话"} {index + 1}
          </button>
        ))}
      </nav>
    </aside>
    <section className={developerToken ? "tasks ai-chat ai-chat-developer" : "tasks ai-chat"} aria-labelledby={compact ? undefined : "ai-chat-title"} aria-label={compact ? "用户 Agent" : undefined}>
      {(!compact || chatTimer || developerToken) && <header className="ai-chat-header">
        {!compact && <h1 id="ai-chat-title">
          {developerToken ? <Terminal size={18} aria-hidden="true" /> : <MessageSquare size={18} aria-hidden="true" />}
          {developerToken ? "开发 Agent · OpenCode" : "用户 Agent"}
        </h1>}
        <div className="ai-chat-status">
          {chatTimer && !developerToken && <ChatTimer action={chatTimer} open={returnToTimer} />}
          {!compact && (developerToken || typeof connection !== "object") && <span role="status">
            {developerToken ? "开发模式" : "API 未连接"}
          </span>}
          {developerToken && <button type="button" disabled={!!pending || openingThread} onClick={lock}>退出开发模式</button>}
        </div>
      </header>}
      {developerToken && (
        <div className="ai-developer-controls">
          <div className="ai-chat-status">
            <select aria-label="开发模式" value={mode} disabled={!!pending || openingThread || reviewOpen}
              onChange={(event) => setMode(event.target.value === "plan" ? "plan" : "build")}>
              <option value="build">编辑代码</option>
              <option value="plan">仅规划</option>
            </select>
            <button type="button" disabled={!!pending || openingThread} aria-pressed={reviewOpen}
              onClick={() => setReviewOpen(!reviewOpen)}>
              {reviewOpen ? "返回对话" : "审查改动"}
            </button>
          </div>
          <small title={workspace}>{"开发工作区"} {workspace}</small>
        </div>
      )}
      {developerToken && reviewOpen ? (
        <DeveloperChangeReview token={developerToken} onLocked={handleDeveloperLock} />
      ) : <>
      <div className="ai-chat-log" role="log" aria-label="聊天记录" tabIndex={0} ref={transcript}
        onScroll={(event) => {
          const log = event.currentTarget;
          followStream.current = log.scrollHeight - log.clientHeight - log.scrollTop < 48;
        }}>
        {!messages.length && !pending && !error && !passphrasePrompt && (
          !developerToken && typeof connection === "object" ? (
            <div className="ai-chat-line ai-chat-welcome">
              <span>AI</span>
              <div className="ai-chat-message">
                <div>嗨，我是你的数据人格。今天想聊点什么？</div>
                {connection.memory && <small>试试说「记住我喜欢晚饭后散步」，下次再问我记住了什么。</small>}
              </div>
            </div>
          ) : (
            <p className="ai-chat-line ai-chat-empty">
              <span aria-hidden="true">$</span>
              <span>
                {connection === "checking" ? "正在检查本地 API 配置…" :
                  connection === "unconfigured" ? chatErrors.missing_key :
                    connection === "unavailable" ? "AI 对话可在本地开发预览中使用。" :
                      "输入一条消息，开始对话。"}
              </span>
            </p>
          )
        )}
        {messages.map((message, index) => {
          const local = "local" in message ? (message as UserChatMessage).local : undefined;
          const comparison = (message as UserChatMessage).comparison;
          if (local && local.scope !== saveSnapshot()?.scope) return null;
          return <div key={index}>
            <p className="ai-chat-line">
              <span>{developerToken ? (message.role === "user" ? ">" : "<") : (message.role === "user" ? "你" : "AI")}</span>
              <span className={developerToken ? undefined : "ai-chat-message"}><ChatText content={message.content} /></span>
            </p>
            {comparison && openComparison && <button className="ai-chat-comparison" type="button" onClick={() => openComparison(comparison)}>查看比价卡</button>}
          </div>;
        })}
        {phase === "reflection" && walk && (
          <div className="ai-chat-line ai-walk-reflection">
            <span>AI</span>
            <div>
              <span className="ai-chat-message">{walk.chinese ? "散步已打卡。这次走得感觉怎么样？" : "Your walk is checked in. How did it feel this time?"}</span>
              <button type="button" disabled={!!pending} onClick={() => setWalk(undefined)}>
                {walk.chinese ? "跳过感悟" : "Skip reflection"}
              </button>
            </div>
          </div>
        )}
        {!developerToken && proposal && <AiCardDraft proposal={proposal.card} state={state} now={now}
          busy={!!pending || savingProposal} confirm={() => void confirmProposal()}
          cancel={() => { setProposal(undefined); setError(""); }} />}
        {pending && (
          <>
            <p className="ai-chat-line">
              <span>{developerToken ? ">" : "你"}</span>
              <span className={developerToken ? undefined : "ai-chat-message"}><ChatText content={pending} /></span>
            </p>
            <p className="ai-chat-line ai-chat-pending">
              <span>{developerToken ? "<" : "AI"}</span>
              {streamed ? <span className="ai-chat-message" aria-live="off"><ChatText content={streamed} /></span> :
                <span className="ai-chat-wait" role="status">
                  <span>{reading ? "正在读取记录并整理回答…" : searching ? "正在查询 Channel3 商家报价…" : developerToken ? "OpenCode 正在工作…" : "正在等待回复…"}</span>
                  <span className="ai-chat-dots" aria-hidden="true"><i /><i /><i /></span>
                </span>}
            </p>
          </>
        )}
        {developerToken && toolsUsed.length > 0 && !pending && (
          <p className="ai-chat-line ai-chat-note">
            <span aria-hidden="true">$</span>
            <span>{"已使用工具"} {toolsUsed.map((name) => toolLabels[name]).join(" / ")}</span>
          </p>
        )}
        {passphrasePrompt && (
          <p className="ai-chat-line">
            <span aria-hidden="true">&lt;</span>
            <span>{passphrasePrompt}</span>
          </p>
        )}
        {error && (
          <p className="ai-chat-line ai-chat-note" role="alert">
            <span aria-hidden="true">!</span>
            <span>{error}</span>
          </p>
        )}
      </div>
      {passphrasePrompt ? (
        <form className="ai-chat-compose" onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const passphrase = String(new FormData(form).get("passphrase") ?? "");
          form.reset();
          if (passphrase && !unlocking) void unlock(passphrase);
        }}>
          <span aria-hidden="true">$</span>
          <input type="password" name="passphrase" aria-label="开发口令" placeholder="请输入开发口令" autoComplete="off" autoFocus required maxLength={512} disabled={unlocking} />
          <div className="ai-chat-status">
            <button type="submit" disabled={unlocking}>解锁</button>
            <button type="button" disabled={unlocking} onClick={() => {
              setPassphrasePrompt(null);
              setError("");
            }}>取消</button>
          </div>
        </form>
      ) : <form
        className="ai-chat-compose"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <span aria-hidden="true">&gt;</span>
        <textarea
          ref={input}
          aria-label="消息"
          placeholder={compact ? "消息" : "输入消息…"}
          rows={compact ? 1 : 2}
          maxLength={AI_CHAT_INPUT_LIMIT}
          readOnly={pending !== null}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              event.keyCode !== 229
            ) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button type="submit" disabled={!canSend}>
          发送
        </button>
        {!!chatLinks(draft).length && (
          <div className="ai-chat-draft-links" aria-label="草稿中的链接">
            {chatLinks(draft).map(({ href, text, index }) => <ChatLink href={href} key={index}>{text}</ChatLink>)}
          </div>
        )}
      </form>}
      </>}
    </section>
    </div>
  );
}
