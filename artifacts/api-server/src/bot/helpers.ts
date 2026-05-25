import { Context } from "grammy";
import { bs } from "./font";

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
  emojiTag?: string;
}): string {
  const star = params.emojiTag || "⭐";
  let msg = `🧾 *${bs("Order Summary")}*\n`;
  msg += `━━━━━━━━━━━━━━━━\n`;
  msg += `🆔 ${bs("Order ID")}: \`${params.orderId}\`\n`;
  msg += `📦 ${bs("Service")}: ${params.serviceName}\n`;
  msg += `🎯 ${bs("Package")}: ${params.itemLabel}\n`;
  if (params.quantity) msg += `📊 ${bs("Quantity")}: ${params.quantity}\n`;
  if (params.targetInfo) msg += `🔗 ${bs("Target")}: \`${params.targetInfo}\`\n`;
  msg += `💰 ${bs("Amount")}: ${params.price.toLocaleString()} ${params.unit}\n`;
  msg += `━━━━━━━━━━━━━━━━\n`;
  msg += `${star} ${bs("MG Pizza Services")}`;
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
  const userRef = params.username ? `@${params.username}` : params.firstName || `${bs("ID")}: ${params.userId}`;
  let msg = `🔔 *ငွေလွှဲပြေစာ လက်ခံရရှိပါသည်*\n`;
  msg += `━━━━━━━━━━━━━━━━\n`;
  msg += `👤 ${bs("Customer")}: ${userRef}\n`;
  msg += `🆔 ${bs("User ID")}: \`${params.userId}\`\n`;
  msg += `🆔 ${bs("Order ID")}: \`${params.orderId}\`\n`;
  msg += `📦 ${bs("Service")}: ${params.serviceName}\n`;
  msg += `🎯 ${bs("Package")}: ${params.itemLabel}\n`;
  if (params.targetInfo) msg += `🔗 ${bs("Target")}: \`${params.targetInfo}\`\n`;
  msg += `💰 ${bs("Amount")}: ${params.price.toLocaleString()} ${params.unit}\n`;
  msg += `━━━━━━━━━━━━━━━━\n`;
  msg += `⏳ စစ်ဆေးပြီး ${bs("confirm")} လုပ်ပေးပါ`;
  return msg;
}

export function isOwner(ctx: Context, ownerChatId: string): boolean {
  return String(ctx.from?.id) === ownerChatId;
}
