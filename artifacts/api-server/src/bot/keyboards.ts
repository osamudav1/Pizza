import { InlineKeyboard } from "grammy";
import type { Service } from "./db";
import { bs } from "./font";

function btn(text: string, callbackData: string): any {
  return { text, callback_data: callbackData };
}

// ─── User Keyboards ──────────────────────────────────────

export function mainMenuKeyboard(services: Service[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const svc of services) {
    kb.add(btn(svc.name, `svc:${svc.id}`)).row();
  }
  return kb;
}

// New-style service page: photo+caption → Items (2x2) → Buy or Contact + Back
export function servicePageKeyboard(svc: Service): InlineKeyboard {
  const isContact = svc.targetType === "contact" || svc.category === "contact";
  const kb = new InlineKeyboard();

  // Add items in 2 columns (max 2 rows as requested)
  const items = svc.items || [];
  const displayItems = items.slice(0, 4); // 2 rows * 2 cols = 4 items

  for (let i = 0; i < displayItems.length; i += 2) {
    const rowItems = displayItems.slice(i, i + 2);
    const buttons = rowItems.map(item => {
      if (item.requireContact) {
        return btn(`📞 ${bs(item.label)}`, `contact:${svc.id}:${item.id}`);
      } else {
        return btn(
          `${bs(item.label)} · ${item.price.toLocaleString()}ks`,
          `buy:${svc.id}:${item.id}`
        );
      }
    });
    kb.add(...buttons).row();
  }

  if (isContact) {
    kb.url(`📩 ${bs("Owner")} ဆက်သွယ်ရန်`, "https://t.me/Mg_Piizzaa").row();
  } else {
    kb.add(btn(`🛒 ဝယ်ယူရန်`, `buy_service:${svc.id}`)).row();
  }
  kb.add(btn(`🔙 ${bs("Back")}`, "back:main")).row();
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
          btn(`${bs(pair[0].label)} · ${pair[0].price.toLocaleString()}ks`, `buy:${service.id}:${pair[0].id}`),
          btn(`${bs(pair[1].label)} · ${pair[1].price.toLocaleString()}ks`, `buy:${service.id}:${pair[1].id}`)
        ).row();
      } else {
        kb.add(
          btn(`🛒 ${bs(pair[0].label)}  ·  ${pair[0].price.toLocaleString()} ${bs("ks")}`, `buy:${service.id}:${pair[0].id}`)
        ).row();
      }
    }
  } else {
    for (const item of pageItems) {
      if (item.requireContact) {
        kb.add(btn(`📞 ${bs(item.label)}`, `contact:${service.id}:${item.id}`)).row();
      } else {
        kb.add(
          btn(
            `🛒 ${bs(item.label)}  ·  ${item.price.toLocaleString()} ${bs("ks")}`,
            `buy:${service.id}:${item.id}`
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

  kb.add(btn(`🔙 ${bs("Back")}`, "back:main")).row();
  return kb;
}

export function ownerOrderKeyboard(orderId: string): InlineKeyboard {
  return new InlineKeyboard()
    .add(btn(`✅  ${bs("Confirm")} — ငွေလက်ခံရရှိပါသည်`, `owner:confirm:${orderId}`))
    .row()
    .add(btn(`❌  ${bs("Reject")} — လက်ခံမရရှိပါ`, `owner:reject:${orderId}`));
}

export function ownerDoneKeyboard(orderId: string): InlineKeyboard {
  return new InlineKeyboard().add(
    btn(`📤  ${bs("Done Slip")} ပို့မည်`, `owner:done:${orderId}`)
  );
}

export function contactOwnerKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .url(`📩 ${bs("Owner")} ကို ဆက်သွယ်ရန်`, "https://t.me/Mg_Piizzaa")
    .row()
    .add(btn(`🔙 ${bs("Back")}`, "back:main"));
}

export function mgServiceButton(): InlineKeyboard {
  return new InlineKeyboard().add(
    btn(`🍕 ${bs("MG Pizza Services")}`, "mg:service")
  );
}

// ─── Admin Keyboards ─────────────────────────────────────

export function adminMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .add(btn(`📋 Service List ကြည့်`, "admin:list")).row()
    .add(btn(`➕ Service အသစ်ထည့်`, "admin:add")).row()
    .add(btn(`🖼️ Welcome Photo/Caption ပြင်`, "admin:welcome_media")).row()
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
  const orgCount = svc.orgPrices ? Object.keys(svc.orgPrices).length : 0;
  return new InlineKeyboard()
    .add(btn(`✏️ Service Name ပြင်`, `admin:name:${svc.id}`)).row()
    .add(btn(`📸 Photo + Caption ထည့်/ပြင်`, `admin:svc_media:${svc.id}`)).row()
    .add(btn(`🎯 Target Type ပြင်`, `admin:svc_target:${svc.id}`)).row()
    .add(btn(`📦 Items စီမံ (ထည့် / ပြင် / ဖျက်)`, `admin:items:${svc.id}`)).row()
    .add(btn(`💰 Org Price${orgCount > 0 ? ` (${orgCount})` : ""} သတ်မှတ်`, `admin:orgprice:${svc.id}`)).row()
    .add(btn(`🗑️ Service ဖျက်`, `admin:del:${svc.id}`)).row()
    .add(btn(`🔙 Services`, "admin:svcs")).row();
}

export function adminOrgPriceKeyboard(svcId: string): InlineKeyboard {
  return new InlineKeyboard()
    .add(btn(`➕ Price ထည့်`, `admin:orgprice_add:${svcId}`)).row()
    .add(btn(`🗑️ Price အကုန် ဖျက်`, `admin:orgprice_clear:${svcId}`)).row()
    .add(btn(`🔙 Service`, `admin:svc:${svcId}`)).row();
}

// Target type keyboard for editing existing service
export function adminTargetTypeKeyboard(svcId: string): InlineKeyboard {
  return new InlineKeyboard()
    .add(btn(`🎮 UC (PUBG)`, `admin:target:${svcId}:uc`)).row()
    .add(btn(`💎 Diamonds / ML`, `admin:target:${svcId}:dia`)).row()
    .add(btn(`📋 မှတ်ချက်ရေးရန် (General)`, `admin:target:${svcId}:general`)).row()
    .add(btn(`⭐ Tg star`, `admin:target:${svcId}:tg_star`)).row()
    .add(btn(`📞 Contact Owner`, `admin:target:${svcId}:contact`)).row()
    .add(btn(`🔙 Back`, `admin:svc:${svcId}`)).row();
}

// Target type keyboard for new service add flow
export function adminNewSvcTargetKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .add(btn(`🎮 UC (PUBG)`, `admin:addcat:uc`)).row()
    .add(btn(`💎 Diamonds / ML (Dia)`, `admin:addcat:dia`)).row()
    .add(btn(`📋 မှတ်ချက်ရေးရန် (General)`, `admin:addcat:general`)).row()
    .add(btn(`⭐ Tg star`, `admin:addcat:tg_star`)).row()
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
    .add(btn(`✅ ဟုတ်ကဲ့ ဖျက်မည်`, `admin:del_ok:${svcId}`)).row()
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
  kb.add(btn(`➕ Item အသစ်ထည့်`, `admin:iadd:${svc.id}`)).row()
    .add(btn(`🔙 Service`, `admin:svc:${svc.id}`)).row();
  return kb;
}

export function adminItemManageKeyboard(svcId: string, itemId: string): InlineKeyboard {
  return new InlineKeyboard()
    .add(btn(`✏️ Label ပြင်`, `admin:ilabel:${svcId}:${itemId}`)).row()
    .add(btn(`💰 Price ပြင်`, `admin:iprice:${svcId}:${itemId}`)).row()
    .add(btn(`🗑️ Item ဖျက်`, `admin:idel:${svcId}:${itemId}`)).row()
    .add(btn(`🔙 Items`, `admin:items:${svcId}`)).row();
}

export function adminCategoryKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .add(btn(`🛒 Main (ငွေပေး order)`, "admin:cat:main")).row()
    .add(btn(`📞 Contact (owner ဆက်သွယ်)`, "admin:cat:contact")).row()
    .add(btn(`❌ ဖျက်မည်`, "admin:cancel")).row();
}

export function adminAddMoreItemsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .add(btn(`✅ ပြီးပြီ — Service သိမ်းမည်`, "admin:add_done")).row()
    .add(btn(`❌ ဖျက်မည်`, "admin:cancel")).row();
}
