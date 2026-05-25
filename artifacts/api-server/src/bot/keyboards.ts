import { InlineKeyboard } from "grammy";
import type { Service } from "./db";
import { bs } from "./font";

type ButtonStyle = "primary" | "success" | "danger";

function btn(text: string, callbackData: string, style?: ButtonStyle): any {
  const b: any = { text, callback_data: callbackData };
  if (style) b.style = style;
  return b;
}

// ─── User Keyboards ──────────────────────────────────────

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

export function contactOwnerKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .url(`📩 ${bs("Owner")} ကို ဆက်သွယ်ရန်`, "https://t.me/Mg_Piizzaa")
    .row()
    .add(btn(`🔙 ${bs("Back")}`, "back:main", "danger"));
}

export function mgServiceButton(): InlineKeyboard {
  return new InlineKeyboard().add(
    btn(`🍕 ${bs("MG Pizza Services")}`, "mg:service", "primary")
  );
}

// ─── Admin Keyboards ─────────────────────────────────────

export function adminMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .add(btn(`📋 Service List ကြည့်`, "admin:list", "primary")).row()
    .add(btn(`➕ Service အသစ်ထည့်`, "admin:add", "success")).row()
    .add(btn(`⚙️ Service စီမံ / ပြင် / ဖျက်`, "admin:svcs")).row();
}

export function adminServicesKeyboard(services: Service[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const svc of services) {
    kb.add(btn(svc.name, `admin:svc:${svc.id}`)).row();
  }
  kb.add(btn(`🔙 Admin Menu`, "admin:back")).row();
  return kb;
}

export function adminServiceManageKeyboard(svc: Service): InlineKeyboard {
  return new InlineKeyboard()
    .add(btn(`✏️ Service Name ပြင်`, `admin:name:${svc.id}`)).row()
    .add(btn(`📦 Items စီမံ (ထည့် / ပြင် / ဖျက်)`, `admin:items:${svc.id}`, "primary")).row()
    .add(btn(`🗑️ Service ဖျက်`, `admin:del:${svc.id}`, "danger")).row()
    .add(btn(`🔙 Services`, "admin:svcs")).row();
}

export function adminConfirmDeleteKeyboard(svcId: string): InlineKeyboard {
  return new InlineKeyboard()
    .add(btn(`✅ ဟုတ်ကဲ့ ဖျက်မည်`, `admin:del_ok:${svcId}`, "danger")).row()
    .add(btn(`❌ မဖျက်တော့`, `admin:svc:${svcId}`)).row();
}

export function adminServiceItemsKeyboard(svc: Service): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const item of svc.items) {
    const label = item.requireContact
      ? `📞 ${item.label}`
      : `${item.label} — ${item.price.toLocaleString()} ks`;
    kb.add(btn(label, `admin:item:${svc.id}:${item.id}`)).row();
  }
  kb.add(btn(`➕ Item အသစ်ထည့်`, `admin:iadd:${svc.id}`, "success")).row()
    .add(btn(`🔙 Service`, `admin:svc:${svc.id}`)).row();
  return kb;
}

export function adminItemManageKeyboard(svcId: string, itemId: string): InlineKeyboard {
  return new InlineKeyboard()
    .add(btn(`✏️ Label ပြင်`, `admin:ilabel:${svcId}:${itemId}`)).row()
    .add(btn(`💰 Price ပြင်`, `admin:iprice:${svcId}:${itemId}`)).row()
    .add(btn(`🗑️ Item ဖျက်`, `admin:idel:${svcId}:${itemId}`, "danger")).row()
    .add(btn(`🔙 Items`, `admin:items:${svcId}`)).row();
}

export function adminCategoryKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .add(btn(`🛒 Main (ငွေပေး order)`, "admin:cat:main", "success")).row()
    .add(btn(`📞 Contact (owner ဆက်သွယ်)`, "admin:cat:contact")).row()
    .add(btn(`❌ ဖျက်မည်`, "admin:cancel")).row();
}

export function adminAddMoreItemsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .add(btn(`✅ ပြီးပြီ — Service သိမ်းမည်`, "admin:add_done", "success")).row()
    .add(btn(`❌ ဖျက်မည်`, "admin:cancel")).row();
}
