import { Context } from "grammy";
import { bs } from "./font";

const MG_FOOTER = `\n🍕 ${bs("MG Pizza Services")}`;

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
  let msg = `🧾 <b>${bs("Order Summary")}</b>\n`;
  msg += `━━━━━━━━━━━━━━━━\n`;
  msg += `🆔 ${bs("Order ID")}: <code>${params.orderId}</code>\n`;
  msg += `📦 ${bs("Service")}: ${params.serviceName}\n`;
  msg += `🎯 ${bs("Package")}: ${params.itemLabel}\n`;
  if (params.quantity) msg += `📊 ${bs("Quantity")}: ${params.quantity}\n`;
  // if (params.targetInfo) msg += `🔗 ${bs("Target")}: <code>${params.targetInfo}</code>\n`;
  msg += `💰 ${bs("Amount")}: ${params.price.toLocaleString()} ${bs("ks")}\n`;
  msg += `━━━━━━━━━━━━━━━━`;
  msg += MG_FOOTER;
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
  let msg = `🔔 <b>ငွေလွှဲပြေစာ လက်ခံရရှိပါသည်</b>\n`;
  msg += `━━━━━━━━━━━━━━━━\n`;
  msg += `👤 ${bs("Customer")}: ${userRef}\n`;
  msg += `🆔 ${bs("User ID")}: <code>${params.userId}</code>\n`;
  msg += `🆔 ${bs("Order ID")}: <code>${params.orderId}</code>\n`;
  msg += `📦 ${bs("Service")}: ${params.serviceName}\n`;
  msg += `🎯 ${bs("Package")}: ${params.itemLabel}\n`;
  // if (params.targetInfo) msg += `🔗 ${bs("Target")}: <code>${params.targetInfo}</code>\n`;
  msg += `💰 ${bs("Amount")}: ${params.price.toLocaleString()} ${bs("ks")}\n`;
  msg += `━━━━━━━━━━━━━━━━\n`;
  msg += `⏳ စစ်ဆေးပြီး ${bs("confirm")} လုပ်ပေးပါ`;
  msg += MG_FOOTER;
  return msg;
}

export function isOwner(ctx: Context, ownerChatId: string): boolean {
  return String(ctx.from?.id) === ownerChatId;
}
