import { db } from "./db";
import { logger } from "../lib/logger";

function normalizeEmojiKey(emoji: string): string {
  return emoji.replace(/[\uFE0E\uFE0F]/g, "");
}

export async function getPremiumEmojiMap(): Promise<Map<string, string>> {
  try {
    const obj: Record<string, string> = await db.getData("/settings/emojiMap");
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

export async function setPremiumEmojiMapping(emoji: string, id: string): Promise<void> {
  const key = normalizeEmojiKey(emoji);
  let obj: Record<string, string> = {};
  try {
    obj = await db.getData("/settings/emojiMap");
  } catch {}
  obj[key] = id;
  await db.push("/settings/emojiMap", obj, true);
}

export async function removePremiumEmojiMapping(emoji: string): Promise<void> {
  const key = normalizeEmojiKey(emoji);
  let obj: Record<string, string> = {};
  try {
    obj = await db.getData("/settings/emojiMap");
  } catch {}
  delete obj[key];
  await db.push("/settings/emojiMap", obj, true);
}

export async function applyPremiumEmojis(text: string): Promise<string> {
  const map = await getPremiumEmojiMap();
  if (map.size === 0) return text;

  let result = text;
  for (const [emoji, id] of map.entries()) {
    const tag = `<tg-emoji emoji-id="${id}">${emoji}</tg-emoji>`;
    const safe = emoji.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const pattern = emoji.endsWith("\uFE0F")
      ? new RegExp(safe, "g")
      : new RegExp(safe + "\uFE0F|" + safe, "g");

    const before = result;
    result = result.replace(pattern, tag);
    if (result !== before) {
      logger.info({ emoji, id, pattern: pattern.toString() }, "[premium-emoji] replaced in text");
    }
  }

  return result;
}

// Test function: apply emoji map to a sample string and return debug info
export async function debugPremiumEmojis(): Promise<{
  mapSize: number;
  entries: Array<{ emoji: string; id: string; codepoints: string }>;
  testInput: string;
  testOutput: string;
  replaced: boolean;
}> {
  const map = await getPremiumEmojiMap();
  const entries = Array.from(map.entries()).map(([emoji, id]) => ({
    emoji,
    id,
    codepoints: [...emoji].map(c => "U+" + (c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")).join(" "),
  }));
  const testInput = entries.map(e => e.emoji).join(" ") || "(no mappings)";
  const testOutput = await applyPremiumEmojis(testInput);
  return {
    mapSize: map.size,
    entries,
    testInput,
    testOutput,
    replaced: testOutput !== testInput,
  };
}
