import { db } from "./db";

export async function getPremiumEmojiMap(): Promise<Map<string, string>> {
  try {
    const obj: Record<string, string> = await db.getData("/settings/emojiMap");
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

export async function setPremiumEmojiMapping(emoji: string, id: string): Promise<void> {
  let obj: Record<string, string> = {};
  try {
    obj = await db.getData("/settings/emojiMap");
  } catch {}
  obj[emoji] = id;
  await db.push("/settings/emojiMap", obj, true);
}

export async function removePremiumEmojiMapping(emoji: string): Promise<void> {
  let obj: Record<string, string> = {};
  try {
    obj = await db.getData("/settings/emojiMap");
  } catch {}
  delete obj[emoji];
  await db.push("/settings/emojiMap", obj, true);
}

export async function applyPremiumEmojis(text: string): Promise<string> {
  const map = await getPremiumEmojiMap();
  if (map.size === 0) return text;
  let result = text;
  for (const [emoji, id] of map.entries()) {
    const tag = `<tg-emoji emoji-id="${id}">${emoji}</tg-emoji>`;
    result = result.replaceAll(emoji, tag);
  }
  return result;
}
