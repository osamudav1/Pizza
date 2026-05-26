import { db } from "./db";

const DB_PATH = "/settings/premiumEmojiMap";

async function loadMap(): Promise<Map<string, string>> {
  try {
    const raw: Record<string, string> = await db.getData(DB_PATH);
    return new Map(Object.entries(raw));
  } catch {
    return new Map();
  }
}

async function saveMap(map: Map<string, string>): Promise<void> {
  const obj: Record<string, string> = {};
  for (const [emoji, id] of map.entries()) {
    obj[emoji] = id;
  }
  await db.push(DB_PATH, obj, true);
}

export async function addPremiumEmojiMapping(emoji: string, id: string): Promise<void> {
  const map = await loadMap();
  map.set(emoji, id);
  await saveMap(map);
}

export async function deletePremiumEmojiMapping(emoji: string): Promise<boolean> {
  const map = await loadMap();
  const existed = map.has(emoji);
  map.delete(emoji);
  await saveMap(map);
  return existed;
}

export async function getAllPremiumEmojiMappings(): Promise<Map<string, string>> {
  return loadMap();
}

export function extractFirstEmoji(text: string): string {
  if (typeof (Intl as any).Segmenter !== "undefined") {
    const segmenter = new (Intl as any).Segmenter(undefined, { granularity: "grapheme" });
    for (const { segment } of segmenter.segment(text)) {
      if (segment.trim()) return segment;
    }
  }
  return [...text].find(c => c.trim() !== "") || "✨";
}

export async function applyPremiumEmojis(text: string): Promise<string> {
  const map = await loadMap();
  if (map.size === 0) return text;

  let result = text;
  for (const [emoji, id] of map.entries()) {
    result = result.replaceAll(
      emoji,
      `<tg-emoji emoji-id="${id}">${emoji}</tg-emoji>`
    );
  }
  return result;
}
