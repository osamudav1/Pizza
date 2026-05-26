import { db } from "./db";
import { logger } from "../lib/logger";

function normalizeEmojiKey(emoji: string): string {
  return emoji.replace(/[\uFE0E\uFE0F]/g, "");
}

// Extract full grapheme cluster (emoji) from text at a given position
function extractFirstEmoji(text: string): string {
  // Use Intl.Segmenter if available (Node 16+), fallback to spread
  if (typeof (Intl as any).Segmenter !== "undefined") {
    const segmenter = new (Intl as any).Segmenter(undefined, { granularity: "grapheme" });
    for (const { segment } of segmenter.segment(text)) {
      if (segment.trim()) return segment;
    }
  }
  // Fallback: spread to handle surrogate pairs
  return [...text].find(c => c.trim() !== "") || "✨";
}

// HTML-escape text while PRESERVING <tg-emoji> blocks already present
function htmlEscapePreservingTags(text: string): string {
  // Split on existing <tg-emoji>...</tg-emoji> blocks, escape non-tag parts
  const parts: string[] = [];
  const tgTagRe = /<tg-emoji[^>]*>[\s\S]*?<\/tg-emoji>/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = tgTagRe.exec(text)) !== null) {
    // Escape everything before this tag
    const before = text.slice(lastIndex, m.index);
    parts.push(before.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
    // Keep the tag as-is
    parts.push(m[0]);
    lastIndex = m.index + m[0].length;
  }
  // Escape remainder
  const tail = text.slice(lastIndex);
  parts.push(tail.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"));
  return parts.join("");
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

export { extractFirstEmoji };

/**
 * Apply premium emoji replacements to a text string.
 * If the text is plain (no HTML tags), it is HTML-escaped first so that
 * the injected <tg-emoji> tags produce valid HTML and surrounding text is safe.
 */
export async function applyPremiumEmojis(text: string): Promise<string> {
  const map = await getPremiumEmojiMap();
  if (map.size === 0) return text;

  // Determine if the text already contains HTML markup
  const looksLikeHtml = /<[a-zA-Z/]/.test(text);

  // For plain text: HTML-escape (preserving any existing tg-emoji blocks)
  // For HTML text: preserve as-is (admin intentionally used HTML)
  let result = looksLikeHtml ? text : htmlEscapePreservingTags(text);

  for (const [emoji, id] of map.entries()) {
    const tag = `<tg-emoji emoji-id="${id}">${emoji}</tg-emoji>`;
    const safe = emoji.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const emojiAlt = emoji.endsWith("\uFE0F")
      ? safe
      : safe + "\uFE0F|" + safe;

    // Skip existing <tg-emoji> blocks, replace bare emoji
    const combined = new RegExp(
      "(<tg-emoji[^>]*>[\\s\\S]*?<\\/tg-emoji>)|(" + emojiAlt + ")",
      "g"
    );

    const before = result;
    result = result.replace(combined, (match, tgBlock) => {
      if (tgBlock !== undefined) return tgBlock;
      return tag;
    });

    if (result !== before) {
      logger.info({ emoji, id }, "[premium-emoji] replaced in text");
    }
  }

  return result;
}

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
    codepoints: [...emoji]
      .map(c => "U+" + (c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0"))
      .join(" "),
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
