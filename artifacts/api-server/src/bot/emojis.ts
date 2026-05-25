import { db } from "./db";

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
    // Replace emoji+variation-selector (U+FE0F) FIRST — more specific match
    if (!emoji.endsWith("\uFE0F")) {
      result = result.replaceAll(emoji + "\uFE0F", tag);
    }
    // Then replace bare emoji (without variation selector)
    // Use a pattern that won't re-replace what's already inside <tg-emoji> tags
    result = result.replace(
      new RegExp(
        emoji.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![^<]*<\\/tg-emoji>)",
        "g"
      ),
      tag
    );
  }

  return result;
}
