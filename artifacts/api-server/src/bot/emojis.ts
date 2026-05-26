import { logger } from "../lib/logger";

// ရိုးရိုး emoji နဲ့ Premium ID ကို ချိတ်ဆက်ထားတဲ့ Map
const premiumEmojiMap = new Map<string, string>([
  ["👛", "5368324170671202286"], // 👛 ကို ဒီ ID နဲ့ ပြောင်းမယ်
  ["💎", "5431698324170671202"]  // 💎 ကို ဒီ ID နဲ့ ပြောင်းမယ်
]);

// Extract full grapheme cluster (emoji) from text at a given position
export function extractFirstEmoji(text: string): string {
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

export function applyPremiumEmojis(text: string): string {
  let result = text;
  
  // စာသားထဲမှာ ပါသမျှ emoji တွေကို tag နဲ့ လိုက်အစားထိုးတယ်
  for (const [emoji, id] of premiumEmojiMap.entries()) {
    result = result.replaceAll(
      emoji, 
      `<tg-emoji emoji-id="${id}">${emoji}</tg-emoji>`
    );
  }
  
  return result;
}
