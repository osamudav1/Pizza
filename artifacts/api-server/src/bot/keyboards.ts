import { InlineKeyboard } from "grammy";
import type { Service } from "./db";
import { bs } from "./font";

type ColoredButton = { text: string; callback_data: string; color?: number };

function btn(text: string, data: string, color?: number): ColoredButton {
  const b: ColoredButton = { text, callback_data: data };
  if (color !== undefined) b.color = color;
  return b;
}

const COLOR = {
  DEFAULT: 1,
  BLUE: 2,
  GREEN: 3,
  RED: 4,
} as const;

export function mainMenuKeyboard(services: Service[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const svc of services) {
    kb.add(btn(svc.name, `svc:${svc.id}`, COLOR.BLUE)).row();
  }
  return kb;
}

export function serviceItemsKeyboard(service: Service): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const item of service.items) {
    if (item.requireContact) {
      kb.add(btn(`${item.label}`, `contact:${service.id}:${item.id}`, COLOR.BLUE)).row();
    } else {
      kb.add(
        btn(
          `${item.label} — ${item.price.toLocaleString()} ${item.unit}`,
          `buy:${service.id}:${item.id}`,
          COLOR.GREEN
        )
      ).row();
    }
  }
  kb.add(btn(`🔙 ${bs("Back")}`, "back:main", COLOR.DEFAULT)).row();
  return kb;
}

export function ownerOrderKeyboard(orderId: string): InlineKeyboard {
  return new InlineKeyboard()
    .add(btn(`✅ ငွေလက်ခံရရှိပါသည်`, `owner:confirm:${orderId}`, COLOR.GREEN))
    .add(btn(`❌ လက်ခံမရရှိပါ`, `owner:reject:${orderId}`, COLOR.RED));
}

export function ownerDoneKeyboard(orderId: string): InlineKeyboard {
  return new InlineKeyboard().add(
    btn(`📤 ${bs("Done")} စလစ်ပို့မည်`, `owner:done:${orderId}`, COLOR.BLUE)
  );
}

export function adminMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .add(btn(`📋 ${bs("Service List")} ကြည့်`, "admin:list", COLOR.BLUE)).row()
    .add(btn(`➕ ${bs("Service")} အသစ်ထည့်`, "admin:add", COLOR.GREEN)).row()
    .add(btn(`✏️ ${bs("Service")} ပြင်`, "admin:edit", COLOR.DEFAULT)).row()
    .add(btn(`🗑️ ${bs("Service")} ဖျက်`, "admin:delete", COLOR.RED)).row();
}
