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

  // Split on HTML tags so we never replace inside <tag ...> or <tg-emoji ...>
  const parts = text.split(/(<[^>]+>)/);
  const processed = parts.map((part) => {
    if (part.startsWith("<")) return part;
    let result = part;
    for (const [emoji, id] of map.entries()) {
      const tag = `<tg-emoji emoji-id="${id}">${emoji}</tg-emoji>`;
      result = result.replaceAll(emoji, tag);
      // Also match emoji + variation selector U+FE0F
      if (!emoji.endsWith("\uFE0F")) {
        result = result.replaceAll(emoji + "\uFE0F", tag);
      }
    }
    return result;
  });

  return processed.join("");
}
