import { Context } from "grammy";

export function generateOrderId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${ts}-${rand}`;
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
  let msg = `🧾 *Order Summary*\n`;
  msg += `━━━━━━━━━━━━━━━━\n`;
  msg += `🆔 Order ID: \`${params.orderId}\`\n`;
  msg += `📦 Service: ${params.serviceName}\n`;
  msg += `🎯 Package: ${params.itemLabel}\n`;
  if (params.quantity) msg += `📊 Quantity: ${params.quantity}\n`;
  if (params.targetInfo) msg += `🔗 Target: \`${params.targetInfo}\`\n`;
  msg += `💰 Amount: ${params.price.toLocaleString()} ${params.unit}\n`;
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
  let msg = `🔔 *ငွေလွှဲပြေစာ လက်ခံရရှိပါသည်*\n`;
  msg += `━━━━━━━━━━━━━━━━\n`;
  msg += `👤 Customer: ${userRef}\n`;
  msg += `🆔 User ID: \`${params.userId}\`\n`;
  msg += `🆔 Order ID: \`${params.orderId}\`\n`;
  msg += `📦 Service: ${params.serviceName}\n`;
  msg += `🎯 Package: ${params.itemLabel}\n`;
  if (params.targetInfo) msg += `🔗 Target: \`${params.targetInfo}\`\n`;
  msg += `💰 Amount: ${params.price.toLocaleString()} ${params.unit}\n`;
  msg += `━━━━━━━━━━━━━━━━\n`;
  msg += `⏳ စစ်ဆေးပြီး confirm လုပ်ပေးပါ`;
  return msg;
}

export function isOwner(ctx: Context, ownerChatId: string): boolean {
  return String(ctx.from?.id) === ownerChatId;
}
