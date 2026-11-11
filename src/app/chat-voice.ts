import { chatVoice, type ChatVoice } from "../../shared/ai-voice";
import { chatVoiceSlot } from "../local-data/registered-storage";
import type { State } from "../model";

type Character = Pick<State, "region" | "createdAt">;
type Language = "zh" | "other";
type Voices = Partial<Record<Language, ChatVoice>>;

const language = (message: string): Language => /[\u3400-\u9fff]/.test(message) ? "zh" : "other";

function storedVoices(character: Character): Voices {
  try {
    const raw = chatVoiceSlot(character).read().value;
    if (!raw) return {};
    const profiles = JSON.parse(raw);
    return {
      zh: chatVoice.safeParse(profiles?.zh).data,
      other: chatVoice.safeParse(profiles?.other).data,
    };
  } catch {
    return {};
  }
}

export function readChatVoice(character: Character, message: string) {
  return storedVoices(character)[language(message)];
}

export function updateChatVoice(previous: ChatVoice | undefined, message: string): ChatVoice | undefined {
  const text = message.replace(/```[\s\S]*?```|https?:\/\/\S+/g, " ").trim();
  const length = Array.from(text.replace(/\s/g, "")).length;
  if (length < 5 || length > 600) return previous;
  const clauses = text.split(/[\n，、。！？；,.!?;]+/).filter((clause) => clause.trim()).length;
  const sample = {
    clauseLength: Math.min(100, Math.max(1, Math.round(length / Math.max(1, clauses)))),
    multiline: text.includes("\n") ? 100 : 0,
    casual: /(?:^|[\s，。！？])(?:嗯|好吧|咱们|我觉得|你看|那就)|\b(?:hey|yep|yeah|gonna|kinda|okay|i'm|that's|let's)\b/i.test(text) ? 100 : 0,
    polite: /(?:请问|麻烦|请您|劳驾)|\b(?:please|could you|would you|thank you)\b/i.test(text) ? 100 : 0,
    expressive: /[!！…]|\p{Extended_Pictographic}/u.test(text) ? 100 : 0,
  };
  if (!previous) return { samples: 1, ...sample };
  const weight = Math.min(previous.samples, 11);
  const average = (key: keyof typeof sample) => Math.round((previous[key] * weight + sample[key]) / (weight + 1));
  return {
    samples: Math.min(24, previous.samples + 1),
    clauseLength: average("clauseLength"),
    multiline: average("multiline"),
    casual: average("casual"),
    polite: average("polite"),
    expressive: average("expressive"),
  };
}

export function rememberChatVoice(character: Character, message: string) {
  const voices = storedVoices(character);
  const key = language(message);
  const next = updateChatVoice(voices[key], message);
  if (next !== voices[key]) chatVoiceSlot(character).write(JSON.stringify({ ...voices, [key]: next }));
}
