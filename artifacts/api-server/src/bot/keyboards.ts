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
    kb.add(btn(svc.name, `svc:${svc.id}`, "primary")).row();
  }
  return kb;
}

// New-style service page: photo+caption → Buy or Contact + Back
export function servicePageKeyboard(svc: Service): InlineKeyboard {
  const isContact = svc.targetType === "contact" || svc.category === "contact";
  const kb = new InlineKeyboard();
  if (isContact) {
    kb.url(`📩 ${bs("Owner")} ဆက်သွယ်ရန်`, "https://t.me/Mg_Piizzaa").row();
  } else {
    kb.add(btn(`🛒 ဝယ်ယူရန်`, `buy_service:${svc.id}`, "success")).row();
  }
  kb.add(btn(`🔙 ${bs("Back")}`, "back:main", "danger")).row();
  return kb;
}

// Legacy: items list keyboard (backward compat for services without photo/caption)
export function serviceItemsKeyboard(service: Service, page = 0): InlineKeyboard {
  const kb = new InlineKeyboard();
  const ITEMS_PER_PAGE = 10;
  const items = service.items;
  const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
  const pageItems = items.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  const twoCol = service.id.startsWith("uc") || service.id.startsWith("dia");

  if (twoCol) {
    for (let i = 0; i < pageItems.length; i += 2) {
      const pair = pageItems.slice(i, i + 2);
      if (pair.length === 2) {
        kb.add(
          btn(`${bs(pair[0].label)} · ${pair[0].price.toLocaleString()}ks`, `buy:${service.id}:${pair[0].id}`, "success"),
          btn(`${bs(pair[1].label)} · ${pair[1].price.toLocaleString()}ks`, `buy:${service.id}:${pair[1].id}`, "success")
        ).row();
      } else {
        kb.add(
          btn(`🛒 ${bs(pair[0].label)}  ·  ${pair[0].price.toLocaleString()} ${bs("ks")}`, `buy:${service.id}:${pair[0].id}`, "success")
        ).row();
      }
    }
  } else {
    for (const item of pageItems) {
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
  }

  if (totalPages > 1) {
    const nav: any[] = [];
    if (page > 0) nav.push(btn(`◀ ${page}`, `svcpg:${service.id}:${page - 1}`));
    nav.push(btn(`${page + 1}/${totalPages}`, "noop"));
    if (page < totalPages - 1) nav.push(btn(`${page + 2} ▶`, `svcpg:${service.id}:${page + 1}`));
    kb.add(...nav).row();
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
    const icon = svc.photo ? "📸" : svc.caption ? "📝" : "📦";
    kb.add(btn(`${icon} ${svc.name}`, `admin:svc:${svc.id}`)).row();
  }
  kb.add(btn(`🔙 Admin Menu`, "admin:back")).row();
  return kb;
}

export function adminServiceManageKeyboard(svc: Service): InlineKeyboard {
  return new InlineKeyboard()
    .add(btn(`✏️ Service Name ပြင်`, `admin:name:${svc.id}`)).row()
    .add(btn(`📸 Photo + Caption ထည့်/ပြင်`, `admin:svc_media:${svc.id}`, "primary")).row()
    .add(btn(`🎯 Target Type ပြင်`, `admin:svc_target:${svc.id}`)).row()
    .add(btn(`📦 Items စီမံ (ထည့် / ပြင် / ဖျက်)`, `admin:items:${svc.id}`)).row()
    .add(btn(`🗑️ Service ဖျက်`, `admin:del:${svc.id}`, "danger")).row()
    .add(btn(`🔙 Services`, "admin:svcs")).row();
}

// Target type keyboard for editing existing service
export function adminTargetTypeKeyboard(svcId: string): InlineKeyboard {
  return new InlineKeyboard()
    .add(btn(`🎮 UC (PUBG)`, `admin:target:${svcId}:uc`, "success")).row()
    .add(btn(`💎 Diamonds / ML`, `admin:target:${svcId}:dia`, "success")).row()
    .add(btn(`📋 General`, `admin:target:${svcId}:general`)).row()
    .add(btn(`📞 Contact Owner`, `admin:target:${svcId}:contact`)).row()
    .add(btn(`🔙 Back`, `admin:svc:${svcId}`)).row();
}

// Target type keyboard for new service add flow
export function adminNewSvcTargetKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .add(btn(`🎮 UC (PUBG)`, `admin:addcat:uc`, "success")).row()
    .add(btn(`💎 Diamonds / ML (Dia)`, `admin:addcat:dia`, "success")).row()
    .add(btn(`📋 General / Other`, `admin:addcat:general`)).row()
    .add(btn(`📞 Contact (ဆက်သွယ်)`, `admin:addcat:contact`)).row()
    .add(btn(`❌ ဖျက်မည်`, "admin:cancel")).row();
}

export function adminSkipPhotoKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .add(btn(`⏭ Photo မထည့်ဘဲ ကျော်ပါ`, "admin:skip_photo")).row()
    .add(btn(`❌ ဖျက်မည်`, "admin:cancel")).row();
}

export function adminSkipCaptionKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .add(btn(`⏭ Caption မထည့်ဘဲ ကျော်ပါ`, "admin:skip_caption")).row()
    .add(btn(`❌ ဖျက်မည်`, "admin:cancel")).row();
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
