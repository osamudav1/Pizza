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
      // Normalize when loading to ensure consistent keys
      premiumEmojiMap.set(normalizeEmoji(emoji), id);
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

// Single-pass replacement to avoid recursion and handle overlapping emojis
export function applyPremiumEmojis(text: string): string {
  if (premiumEmojiMap.size === 0) return text;

  // Sort by length descending to match longest sequences first (e.g., 👨‍👩‍👧‍👦 before 👨)
  const sortedEmojis = Array.from(premiumEmojiMap.keys()).sort((a, b) => b.length - a.length);
  
  // Create a combined regex for all emojis in the map
  // Each emoji is escaped and followed by an optional variation selector
  const pattern = sortedEmojis.map(e => {
    const escaped = e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return `${escaped}[\uFE0E\uFE0F]?`;
  }).join("|");
  
  const regex = new RegExp(`(${pattern})`, "gu");
  
  return text.replace(regex, (match) => {
    const normalized = normalizeEmoji(match);
    const id = premiumEmojiMap.get(normalized);
    if (id) {
      return `<tg-emoji emoji-id="${id}">${match}</tg-emoji>`;
    }
    return match;
  });
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
