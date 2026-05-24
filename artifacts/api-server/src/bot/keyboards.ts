import { InlineKeyboard } from "grammy";
import type { Service } from "./db";

export function mainMenuKeyboard(services: Service[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const svc of services) {
    kb.text(svc.name, `svc:${svc.id}`).row();
  }
  return kb;
}

export function serviceItemsKeyboard(service: Service): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const item of service.items) {
    if (item.requireContact) {
      kb.text(`${item.label}`, `contact:${service.id}:${item.id}`).row();
    } else {
      kb.text(`${item.label} — ${item.price.toLocaleString()} ${item.unit}`, `buy:${service.id}:${item.id}`).row();
    }
  }
  kb.text("🔙 ပြန်သွား", "back:main").row();
  return kb;
}

export function ownerOrderKeyboard(orderId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ ငွေလက်ခံရရှိပါသည်", `owner:confirm:${orderId}`)
    .text("❌ လက်ခံမရရှိပါ", `owner:reject:${orderId}`);
}

export function ownerDoneKeyboard(orderId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("📤 Done စလစ်ပို့မည်", `owner:done:${orderId}`);
}

export function adminMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📋 Service List ကြည့်", "admin:list").row()
    .text("➕ Service အသစ်ထည့်", "admin:add").row()
    .text("✏️ Service ပြင်", "admin:edit").row()
    .text("🗑️ Service ဖျက်", "admin:delete").row();
}
