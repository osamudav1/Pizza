import { Context } from "grammy";
import { bs } from "./font";

const MG_FOOTER = "";

export const mgFooter = MG_FOOTER;

export function generateOrderId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${bs("ORD")}-${ts}-${rand}`;
}

export function formatOrderSummary(params: {
  orderId: string;
  serviceName: string;
  itemLabel: string;
  price: number;
  unit: string;
  targetInfo?: string;
  quantity?: string;
}): string {
  let msg = `🧾 <b>Order Summary</b>\n`;
  msg += `━━━━━━━━━━━━━━━━\n`;
  msg += `🆔 <b>𝗢𝗿𝗱𝗲𝗿 𝗜𝗗</b>: <code>${params.orderId}</code>\n`;
  msg += `📦 <b>𝗦𝗲𝗿𝘃𝗶𝗰𝗲</b>: ${params.serviceName}\n`;
  msg += `🎯 <b>𝗣𝗮𝗰𝗸𝗮𝗴𝗲</b>: ${params.itemLabel}\n`;
  if (params.quantity) msg += `📊 <b>𝗤𝘂𝗮𝗻𝘁𝗶𝘁𝘆</b>: ${params.quantity}\n`;
  msg += `💰 <b>𝗔𝗺𝗼𝘂𝗻𝘁</b>: ${params.price.toLocaleString()} ks\n`;
  msg += `━━━━━━━━━━━━━━━━`;
  return msg;
}

export function formatReceiptNotification(params: {
  orderId: string;
  userId: number;
  username?: string;
  firstName?: string;
  serviceName: string;
  itemLabel: string;
  price: number;
  unit: string;
  targetInfo?: string;
}): string {
  const userRef = params.username ? `@${params.username}` : params.firstName || `ID: ${params.userId}`;
  let msg = `🔔 <b>ငွေလွှဲပြေစာ လက်ခံရရှိပါသည်</b>\n`;
  msg += `━━━━━━━━━━━━━━━━\n`;
  msg += `👤 <b>𝗖𝘂𝘀𝘁𝗼𝗺𝗲𝗿</b>: ${userRef}\n`;
  msg += `🆔 <b>𝗨𝘀𝗲𝗿 𝗜𝗗</b>: <code>${params.userId}</code>\n`;
  msg += `🆔 <b>𝗢𝗿𝗱𝗲𝗿 𝗜𝗗</b>: <code>${params.orderId}</code>\n`;
    msg += `📦 <b>𝗦𝗲𝗿𝘃𝗶𝗰𝗲</b>: ${params.serviceName}\n`;
    if (params.targetInfo) {
      let label = "🎮 <b>𝗚𝗮𝗺𝗲 𝗜𝗗</b>";
      if (params.serviceName?.toLowerCase().includes("star")) {
        label = "👤 <b>𝗨𝘀𝗲𝗿𝗻𝗮𝗺𝗲</b>";
      } else if (params.serviceName?.toLowerCase().includes("boost")) {
        label = "📋 <b>𝗜𝗻𝗳𝗼</b>";
      }
      msg += `${label}: <code>${params.targetInfo}</code>\n`;
    }
    // For Tg Star, we might want to show the quantity (amount) as the package if it's set
    const packageLabel = params.serviceName?.toLowerCase().includes("star") ? (params.itemLabel || "N/A") : params.itemLabel;
    msg += `🎯 <b>𝗣𝗮𝗰𝗸𝗮𝗴𝗲</b>: ${packageLabel}\n`;
  msg += `💰 <b>𝗔𝗺𝗼𝘂𝗻𝘁</b>: ${params.price.toLocaleString()} ks\n`;
  msg += `━━━━━━━━━━━━━━━━\n`;
  // msg += `⏳ စစ်ဆေးပြီး 𝗰𝗼𝗻𝗳𝗶𝗿𝗺 လုပ်ပေးပါ`;
  // Footer removed as per user request
  return msg;
}

export function isOwner(ctx: Context, ownerChatId: string): boolean {
  return String(ctx.from?.id) === ownerChatId;
}
