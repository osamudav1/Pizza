import { InlineKeyboard } from "grammy";
import type { Service } from "./db";
import { bs } from "./font";

type ButtonStyle = "primary" | "success" | "danger";

function btn(text: string, callbackData: string, style?: ButtonStyle): any {
  const b: any = { text, callback_data: callbackData };
  if (style) b.style = style;
  return b;
}

export function mainMenuKeyboard(services: Service[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const svc of services) {
    kb.add(btn(bs(svc.name), `svc:${svc.id}`, "primary")).row();
  }
  return kb;
}

export function serviceItemsKeyboard(service: Service): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const item of service.items) {
    if (item.requireContact) {
      kb.add(btn(`📞 ${bs(item.label)}`, `contact:${service.id}:${item.id}`, "primary")).row();
    } else {
      kb.add(
        btn(
          `🛒 ${bs(item.label)}  ·  ${item.price.toLocaleString()} ${bs("ks")}`,
          `buy:${service.id}:${item.id}`,
          "success"
        )
      ).row();
    }
  }
  kb.add(btn(`🔙 ${bs("Back")}`, "back:main", "danger")).row();
  return kb;
}

export function ownerOrderKeyboard(orderId: string): InlineKeyboard {
  return new InlineKeyboard()
    .add(btn(`✅  ${bs("Confirm")} — ငွေလက်ခံရရှိပါသည်`, `owner:confirm:${orderId}`, "success"))
    .row()
    .add(btn(`❌  ${bs("Reject")} — လက်ခံမရရှိပါ`, `owner:reject:${orderId}`, "danger"));
}

export function ownerDoneKeyboard(orderId: string): InlineKeyboard {
  return new InlineKeyboard().add(
    btn(`📤  ${bs("Done Slip")} ပို့မည်`, `owner:done:${orderId}`, "primary")
  );
}

export function mgServiceButton(): InlineKeyboard {
  return new InlineKeyboard().url(
    `🍕 ${bs("MG Pizza Services")}`,
    "https://t.me/NFT_Sell_Os_bot"
  );
}

export function adminMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .add(btn(`📋  ${bs("Service List")} ကြည့်`, "admin:list", "primary")).row()
    .add(btn(`➕  ${bs("Service")} အသစ်ထည့်`, "admin:add", "success")).row()
    .add(btn(`✏️  ${bs("Service")} ပြင်`, "admin:edit")).row()
    .add(btn(`🗑️  ${bs("Service")} ဖျက်`, "admin:delete", "danger")).row();
}
