import { db } from "./db";

const DB_PATH = "/settings/premiumEmojiMap";

// In-memory cache — startup မှာ DB မှ load လုပ်ပြီး runtime တွင် အမြဲသုံးသည်
const premiumEmojiMap = new Map<string, string>();

// Unicode variation selector strip
function normalizeEmoji(emoji: string): string {
  return emoji.replace(/[\uFE0E\uFE0F]/g, "").trim();
}

// ── Startup load ────────────────────────────────────────────
// Bot start ချိန်မှာ ခေါ်ပါ
export async function loadPremiumEmojis(): Promise<void> {
  try {
    const raw: Record<string, string> = await db.getData(DB_PATH);
    premiumEmojiMap.clear();
    for (const [emoji, id] of Object.entries(raw)) {
      premiumEmojiMap.set(emoji, id);
    }
  } catch {
    // DB မှာ မရှိသေးရင် empty ပဲ ထားပါ
  }
}

// ── Persist helper ──────────────────────────────────────────
async function persistMap(): Promise<void> {
  const obj: Record<string, string> = {};
  for (const [emoji, id] of premiumEmojiMap.entries()) {
    obj[emoji] = id;
  }
  await db.push(DB_PATH, obj, true);
}

// ── Management functions ────────────────────────────────────
export async function setPremiumEmoji(emoji: string, customEmojiId: string): Promise<void> {
  premiumEmojiMap.set(normalizeEmoji(emoji), customEmojiId);
  await persistMap();
}

export async function removePremiumEmoji(emoji: string): Promise<boolean> {
  const normalized = normalizeEmoji(emoji);
  const existed = premiumEmojiMap.has(normalized);
  premiumEmojiMap.delete(normalized);
  await persistMap();
  return existed;
}

export async function clearPremiumEmojis(): Promise<number> {
  const count = premiumEmojiMap.size;
  premiumEmojiMap.clear();
  await persistMap();
  return count;
}

export function getPremiumEmojiMap(): Map<string, string> {
  return premiumEmojiMap;
}

// ── Emoji replacement ───────────────────────────────────────
export function extractFirstEmoji(text: string): string {
  if (typeof (Intl as any).Segmenter !== "undefined") {
    const segmenter = new (Intl as any).Segmenter(undefined, { granularity: "grapheme" });
    for (const { segment } of segmenter.segment(text)) {
      if (segment.trim()) return segment;
    }
  }
  return [...text].find(c => c.trim() !== "") || "✨";
}

// In-memory map ကိုသုံး — async မဟုတ်တော့ speed မြန်သည်
export function applyPremiumEmojis(text: string): string {
  if (premiumEmojiMap.size === 0) return text;

  let result = text;
  for (const [emoji, id] of premiumEmojiMap.entries()) {
    const tag = `<tg-emoji emoji-id="${id}">${emoji}</tg-emoji>`;
    const escaped = emoji.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`${escaped}[\uFE0E\uFE0F]?`, "gu"), tag);
  }
  return result;
}

// Legacy compat aliases
export async function addPremiumEmojiMapping(emoji: string, id: string): Promise<void> {
  return setPremiumEmoji(emoji, id);
}
export async function deletePremiumEmojiMapping(emoji: string): Promise<boolean> {
  return removePremiumEmoji(emoji);
}
export async function getAllPremiumEmojiMappings(): Promise<Map<string, string>> {
  return getPremiumEmojiMap();
}
