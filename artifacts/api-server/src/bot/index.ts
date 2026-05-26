import { Bot, Context, session, SessionFlavor, InlineKeyboard } from "grammy";
import { JsonDbSessionStorage } from "./session-storage";
import { logger } from "../lib/logger";
import {
  db,
  getServices,
  saveOrder,
  updateOrder,
  getOrder,
  addService,
  updateService,
  deleteService,
  type Order,
  type Service,
  type ServiceItem,
} from "./db";
import {
  applyPremiumEmojis,
  debugPremiumEmojis,
  setPremiumEmojiMapping,
  removePremiumEmojiMapping,
  getPremiumEmojiMap,
} from "./emojis";
import {
  mainMenuKeyboard,
  servicePageKeyboard,
  serviceItemsKeyboard,
  ownerOrderKeyboard,
  ownerDoneKeyboard,
  adminMenuKeyboard,
  adminServicesKeyboard,
  adminServiceManageKeyboard,
  adminConfirmDeleteKeyboard,
  adminServiceItemsKeyboard,
  adminItemManageKeyboard,
  adminCategoryKeyboard,
  adminAddMoreItemsKeyboard,
  adminTargetTypeKeyboard,
  adminNewSvcTargetKeyboard,
  adminSkipPhotoKeyboard,
  adminSkipCaptionKeyboard,
  mgServiceButton,
  contactOwnerKeyboard,
} from "./keyboards";
import {
  generateOrderId,
  formatOrderSummary,
  formatReceiptNotification,
  isOwner,
  mgFooter,
} from "./helpers";
import { bs } from "./font";

interface SessionData {
  step?: string;
  pendingOrderId?: string;
  adminStep?: string;
  newService?: Partial<Service>;
  editServiceId?: string;
  editItemId?: string;
  editField?: string;
  collectedPlayerId?: string;
}

type MyContext = Context & SessionFlavor<SessionData>;

const BOT_TOKEN = process.env["BOT_TOKEN"];
const OWNER_CHAT_ID = process.env["OWNER_CHAT_ID"] || "";
const KPAY_NUMBER = process.env["KPAY_NUMBER"] || "";
const GROUP_CHAT_ID = process.env["GROUP_CHAT_ID"] || "";

if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN environment variable is required");
}

function escHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function createBot() {
  const bot = new Bot<MyContext>(BOT_TOKEN!);

  // ─── Premium Emoji Transformer ─────────────────────────────
  bot.api.config.use(async (prev, method, payload, signal) => {
    const p = payload as any;
    if (p) {
      for (const field of ["text", "caption"]) {
        if (typeof p[field] === "string") {
          const replaced = await applyPremiumEmojis(p[field]);
          if (replaced !== p[field]) {
            logger.info({ method, field }, "[premium-emoji] replaced emoji in outgoing message");
            p[field] = replaced;
            if (!p.parse_mode) p.parse_mode = "HTML";
          }
        }
      }
    }
    return prev(method, payload, signal);
  });

  bot.use(
    session({
      initial: (): SessionData => ({}),
      storage: new JsonDbSessionStorage<SessionData>(),
    })
  );

  // ─── /start ───────────────────────────────────────────────
  bot.command("start", async (ctx) => {
    ctx.session = {};
    const services = await getServices();
    await ctx.reply(
      `✨ <b>မင်္ဂလာပါ 🍕 ${bs("Mg Pizza Store")} မှ ကြိုဆိုပါသည်!</b>\n\n` +
        `👤 ${bs("Owner")} သို့ဆက်သွယ်ရန်: <a href="https://t.me/Mg_Piizzaa">@Mg_Piizzaa</a>\n\n` +
        `🛒 ${bs("Service")} များဝယ်ယူရန် တစ်ခုရွေးချယ်ပါ ⬇️`,
      { parse_mode: "HTML", reply_markup: mainMenuKeyboard(services) }
    );
  });

  // ─── /menu ────────────────────────────────────────────────
  bot.command("menu", async (ctx) => {
    ctx.session = {};
    const services = await getServices();
    await ctx.reply(
      `🛒 <b>${bs("Service Menu")}</b>\n\nဝယ်ယူလိုသော ${bs("service")} ကိုနှိပ်ပါ ⬇️`,
      { parse_mode: "HTML", reply_markup: mainMenuKeyboard(services) }
    );
  });

  // ─── /admin ───────────────────────────────────────────────
  bot.command("admin", async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) {
      await ctx.reply("❌ ခွင့်မပြုပါ");
      return;
    }
    ctx.session = {};
    await ctx.reply(
      `⚙️ <b>${bs("Admin Panel")}</b>\n\n${bs("Service")} များ စီမံခန့်ခွဲရန်:`,
      { parse_mode: "HTML", reply_markup: adminMenuKeyboard() }
    );
  });

  // ─── /premium ─────────────────────────────────────────────
  bot.command("premium", async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) {
      await ctx.reply("❌ ခွင့်မပြုပါ");
      return;
    }
    const arg = ctx.match?.trim() || "";
    const parts = arg.split(/\s+/);

    // /premium remove <emoji>  → remove single mapping
    if (parts[0] === "remove" && parts[1]) {
      await removePremiumEmojiMapping(parts[1]);
      await ctx.reply(
        `✅ ${parts[1]} → default ပြန်ပြောင်းပြီးပါပြီ`,
        { parse_mode: "HTML" }
      );
      return;
    }

    // /premium clear  → remove ALL mappings
    if (parts[0] === "clear" && !parts[1]) {
      try { await db.delete("/settings/emojiMap"); } catch {}
      await ctx.reply(`✅ Mapping အကုန် ဖျက်ပြီးပါပြီ`, { parse_mode: "HTML" });
      return;
    }

    // /premium list  → show current mappings
    if (parts[0] === "list") {
      const map = await getPremiumEmojiMap();
      if (map.size === 0) {
        await ctx.reply(`📋 Mapping မရှိသေးပါ`, { parse_mode: "HTML" });
        return;
      }
      let text = `⭐ <b>Premium Emoji Manager</b>\n\n━━━━━━━━━━━━━━━━━━━━━━\n📌 <b>Current Mappings:</b>\n\n`;
      for (const [emoji, id] of map.entries()) {
        text += `${emoji} → <code>${escHtml(id)}</code>\n`;
      }
      text += `━━━━━━━━━━━━━━━━━━━━━━`;
      await ctx.reply(text, { parse_mode: "HTML" });
      return;
    }

    // /premium emojis  → list every emoji used in bot messages + mapping status
    if (parts[0] === "emojis") {
      const BOT_EMOJIS: { emoji: string; where: string }[] = [
        { emoji: "✨", where: "Welcome message" },
        { emoji: "🍕", where: "Welcome / Footer" },
        { emoji: "👤", where: "Welcome / Customer label" },
        { emoji: "🛒", where: "Service menu" },
        { emoji: "⬇️", where: "Service menu" },
        { emoji: "📦", where: "Order Summary – Service" },
        { emoji: "🎯", where: "Order Summary – Package" },
        { emoji: "💰", where: "Order Summary – Amount" },
        { emoji: "🧾", where: "Order Summary – Header" },
        { emoji: "🆔", where: "Order Summary – Order/User ID" },
        { emoji: "🔗", where: "Order Summary – Target" },
        { emoji: "💳", where: "KPay / Wave prompt" },
        { emoji: "📸", where: "Receipt upload prompt" },
        { emoji: "🔔", where: "Owner notification" },
        { emoji: "⏳", where: "Pending / Processing" },
        { emoji: "✅", where: "Success messages" },
        { emoji: "❌", where: "Error messages" },
        { emoji: "📢", where: "Telegram Boost prompt" },
        { emoji: "🎵", where: "TikTok prompt" },
        { emoji: "⭐", where: "Telegram Star prompt" },
        { emoji: "💎", where: "MLbb Diamond prompt" },
        { emoji: "🎮", where: "PUBG UC prompt" },
        { emoji: "📞", where: "Contact / Others" },
        { emoji: "⚙️", where: "Admin panel" },
      ];
      const map = await getPremiumEmojiMap();
      let text = `🎭 <b>Bot Emoji List</b>\n<i>premium ID map လုပ်လို့ ရတဲ့ emoji များ</i>\n\n━━━━━━━━━━━━━━━━━━━━━━\n`;
      for (const { emoji, where } of BOT_EMOJIS) {
        const id = map.get(emoji);
        const status = id ? `✅ <code>${escHtml(id.slice(0, 10))}…</code>` : `⬜ not mapped`;
        text += `${emoji}  ${status}\n<i>${escHtml(where)}</i>\n\n`;
      }
      text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `Map လုပ်ရန်: <code>/premium 🧾 &lt;ID&gt;</code>`;
      await ctx.reply(text, { parse_mode: "HTML" });
      return;
    }

    // /premium debug  → full diagnostic of emoji map + replacement test
    if (parts[0] === "debug") {
      const info = await debugPremiumEmojis();

      if (info.mapSize === 0) {
        await ctx.reply(
          `⚠️ <b>Mapping မရှိသေးပါ</b>\n\n` +
          `Premium emoji map လုပ်ရန်:\n` +
          `1. <code>/premium</code> ကိုနှိပ်ပါ\n` +
          `2. Premium emoji ကို bot ဆီ send လုပ်ပါ (auto-detect)\n\n` +
          `သို့မဟုတ် manual: <code>/premium [emoji] [ID]</code>`,
          { parse_mode: "HTML" }
        );
        return;
      }

      let debugText = `🔍 <b>Premium Emoji Debug</b>\n\n`;
      debugText += `📊 Mapped emojis: <b>${info.mapSize} ခု</b>\n\n`;

      for (const e of info.entries) {
        debugText += `━━━━━━━━━━━━\n`;
        debugText += `Emoji: ${e.emoji}\n`;
        debugText += `Codepoints: <code>${escHtml(e.codepoints)}</code>\n`;
        debugText += `ID: <code>${escHtml(e.id)}</code>\n`;
      }

      debugText += `━━━━━━━━━━━━\n\n`;
      debugText += `✅ Replacement working: <b>${info.replaced ? "YES" : "NO ❌"}</b>\n\n`;
      debugText += `📝 Raw HTML (after replacement):\n<code>${escHtml(info.testOutput)}</code>`;

      await ctx.reply(debugText, { parse_mode: "HTML" });

      // Send a rendered version so owner can see if it looks different
      if (info.replaced) {
        await ctx.reply(
          `👇 <b>Rendered (Telegram ပြတဲ့ပုံ):</b>\n\n` + info.testOutput + `\n\n<i>Premium emoji ဆိုရင် animated/custom ဖြစ်ရမည်\nRegular emoji အတိုင်းဆိုရင် ID မမှန်ပါ</i>`,
          { parse_mode: "HTML" }
        );
      }
      return;
    }

    // /premium <emoji> <id>  → map emoji to premium ID
    if (parts.length >= 2) {
      const emoji = parts[0];
      const id = parts[1];
      await setPremiumEmojiMapping(emoji, id);
      await ctx.reply(
        `✅ <b>Mapped!</b>\n\n${emoji} → <code>${escHtml(id)}</code>`,
        { parse_mode: "HTML" }
      );
      return;
    }

    // /premium  → show manager UI + activate auto-detect
    const map = await getPremiumEmojiMap();
    let currentText = `📌 <b>Current Mappings:</b>\n`;
    if (map.size === 0) {
      currentText += `<i>မရှိသေးပါ</i>\n`;
    } else {
      for (const [emoji, id] of map.entries()) {
        currentText += `${emoji} → <code>${escHtml(id)}</code>\n`;
      }
    }
    await ctx.reply(
      `⭐ <b>Premium Emoji Manager</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        currentText +
        `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `💡 <b>Auto-detect:</b> Premium emoji တစ်ခုကို ယခု ဒီ chat ထဲ send လုပ်ပါ\n` +
        `Bot က ID ကို auto map လုပ်ပေးမည်\n\n` +
        `📌 <b>Commands:</b>\n` +
        `<code>/premium 🧾 &lt;ID&gt;</code> — manual map\n` +
        `<code>/premium remove 🧾</code> — တစ်ခု ဖျက်\n` +
        `<code>/premium clear</code> — အကုန် ဖျက်\n` +
        `<code>/premium emojis</code> — bot emoji list\n` +
        `<code>/premium debug</code> — စစ်ဆေး`,
      { parse_mode: "HTML" }
    );
    ctx.session.step = "waiting_premium_emoji";
  });

  // ─── Callback: Service Selection ──────────────────────────
  bot.callbackQuery(/^svc:(.+)$/, async (ctx) => {
    const serviceId = ctx.match[1];
    const services = await getServices();
    const svc = services.find((s) => s.id === serviceId);
    if (!svc) { await ctx.answerCallbackQuery(`${bs("Service")} မတွေ့ပါ`); return; }
    await ctx.answerCallbackQuery();

    // New-style: service has a catalog photo/caption set by owner
    if (svc.photo || svc.caption) {
      try { await ctx.deleteMessage(); } catch {}
      if (svc.photo) {
        await ctx.replyWithPhoto(svc.photo, {
          caption: svc.caption || escHtml(svc.name),
          parse_mode: "HTML",
          reply_markup: servicePageKeyboard(svc),
        });
      } else {
        await ctx.reply(svc.caption!, {
          parse_mode: "HTML",
          reply_markup: servicePageKeyboard(svc),
        });
      }
      return;
    }

    // Legacy: show items list (backward compat)
    let text = `📦 <b>${escHtml(svc.name)}</b>\n\n`;
    if (svc.category === "contact") {
      text += `ဤ ${bs("service")} များကို ဝယ်ယူရန် ${bs("owner")} ထံ တိုက်ရိုက်ဆက်သွယ်ပေးပါ\n\n`;
    } else {
      text += `ဝယ်ယူလိုသော ${bs("package")} ကို ရွေးချယ်ပါ 👇\n\n`;
      for (const item of svc.items) {
        text += `• ${escHtml(item.label)} — <b>${item.price.toLocaleString()} ${item.unit}</b>\n`;
      }
    }
    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: serviceItemsKeyboard(svc),
    });
  });

  // ─── Callback: Service Page Pagination ────────────────────
  bot.callbackQuery(/^svcpg:(.+):(\d+)$/, async (ctx) => {
    const serviceId = ctx.match[1];
    const page = parseInt(ctx.match[2]);
    const services = await getServices();
    const svc = services.find((s) => s.id === serviceId);
    if (!svc) { await ctx.answerCallbackQuery("မတွေ့ပါ"); return; }
    await ctx.answerCallbackQuery();
    let text = `📦 <b>${escHtml(svc.name)}</b>\n\n`;
    for (const item of svc.items) {
      text += `• ${escHtml(item.label)} — <b>${item.price.toLocaleString()} ${item.unit}</b>\n`;
    }
    try {
      await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: serviceItemsKeyboard(svc, page) });
    } catch {}
  });

  // ─── Callback: No-op (page indicator) ─────────────────────
  bot.callbackQuery("noop", async (ctx) => { await ctx.answerCallbackQuery(); });

  // ─── Callback: Back to Main ────────────────────────────────
  bot.callbackQuery("back:main", async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session = {};
    const services = await getServices();
    // Delete current message (may be a photo) and send new text message
    try { await ctx.deleteMessage(); } catch {}
    await ctx.reply(
      `🛒 <b>${bs("Service Menu")}</b>\n\nဝယ်ယူလိုသော ${bs("service")} ကိုနှိပ်ပါ ⬇️`,
      { parse_mode: "HTML", reply_markup: mainMenuKeyboard(services) }
    );
  });

  // ─── Callback: MG Service Button ───────────────────────────
  bot.callbackQuery("mg:service", async (ctx) => {
    await ctx.answerCallbackQuery({
      text: `🍕 MG Pizza Services\n\nt.me/NFT_Sell_Os_bot`,
      show_alert: true,
    });
  });

  // ─── Callback: Contact ─────────────────────────────────────
  bot.callbackQuery(/^contact:(.+):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `📦 <b>အခြား ${bs("Services")} များ</b>\n\n` +
        `ဝယ်ယူရန် <b>${bs("Owner")}</b> ထံ တိုက်ရိုက်ဆက်သွယ်ပေးပါ\n\n` +
        `👤 <a href="https://t.me/Mg_Piizzaa">@Mg_Piizzaa</a> — ${bs("Owner")}\n\n` +
        `💬 ${bs("Service")} အသေးစိတ် မေးမြန်းနိုင်ပါသည်`,
      { parse_mode: "HTML", reply_markup: contactOwnerKeyboard() }
    );
  });

  // ─── Callback: Buy Item ────────────────────────────────────
  bot.callbackQuery(/^buy:(.+):(.+)$/, async (ctx) => {
    const serviceId = ctx.match[1];
    const itemId = ctx.match[2];
    const services = await getServices();
    const svc = services.find((s) => s.id === serviceId);
    const item = svc?.items.find((i) => i.id === itemId);
    if (!svc || !item) { await ctx.answerCallbackQuery("မတွေ့ပါ"); return; }
    await ctx.answerCallbackQuery();

    const orderId = generateOrderId();
    const order: Order = {
      orderId,
      userId: ctx.from!.id,
      username: ctx.from?.username,
      firstName: ctx.from?.first_name,
      serviceId: svc.id,
      serviceName: svc.name,
      itemId: item.id,
      itemLabel: item.label,
      itemPrice: item.price,
      status: "pending_receipt",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveOrder(order);
    ctx.session.pendingOrderId = orderId;

    // Determine targetType from service (new field or legacy service ID)
    const targetType = svc.targetType ||
      (svc.id === "uc" ? "uc" : svc.id === "dia" ? "dia" : "general");

    const kpayInfo = `💳 <b>${bs("KPay / Wave")} နံပါတ်:</b> <code>${escHtml(KPAY_NUMBER!)}</code>`;
    const orderHeader =
      `📦 ${bs("Service")}: <b>${escHtml(svc.name)}</b>\n` +
      `🎯 ${bs("Package")}: ${escHtml(item.label)}\n` +
      `💰 ငွေပမာဏ: <b>${item.price.toLocaleString()} ks</b>\n\n`;

    if (targetType === "uc") {
      ctx.session.step = "v2_waiting_player_id";
      await ctx.editMessageText(
        orderHeader + kpayInfo + `\n\n` +
        `📋 <b>${bs("Player ID")} (Character ID)</b> ရိုက်ထည့်ပါ:\n<i>ဥပမာ: 5123456789</i>`,
        { parse_mode: "HTML" }
      );
    } else if (targetType === "dia") {
      ctx.session.step = "v2_waiting_player_id";
      await ctx.editMessageText(
        orderHeader + kpayInfo + `\n\n` +
        `📋 <b>${bs("Player ID")}</b> ရိုက်ထည့်ပါ:`,
        { parse_mode: "HTML" }
      );
    } else if (svc.id === "tg_boost") {
      ctx.session.step = "waiting_target";
      await ctx.editMessageText(
        orderHeader + `📢 ${bs("Channel/Group username")} ပေးပို့ပါ\n<code>(ဥပမာ: @mychannel)</code>`,
        { parse_mode: "HTML" }
      );
    } else if (svc.id === "tiktok") {
      ctx.session.step = "waiting_target";
      await ctx.editMessageText(
        orderHeader + `🎵 ${bs("TikTok Post/Profile Link")} ပေးပို့ပါ`,
        { parse_mode: "HTML" }
      );
    } else if (svc.id === "tg_star") {
      ctx.session.step = "waiting_target";
      await ctx.editMessageText(
        orderHeader + `⭐ ${bs("Telegram username")} ပေးပို့ပါ\n<code>(ဥပမာ: @myusername)</code>`,
        { parse_mode: "HTML" }
      );
    } else if (item.requireContact) {
      // Contact item — show owner link
      ctx.session.step = undefined;
      ctx.session.pendingOrderId = undefined;
      await ctx.editMessageText(
        `📞 <b>${escHtml(item.label)}</b>\n\n` +
        `ဤ service အတွက် owner ထံ တိုက်ရိုက်ဆက်သွယ်ပေးပါ`,
        { parse_mode: "HTML", reply_markup: contactOwnerKeyboard() }
      );
    } else if (targetType === "general") {
      ctx.session.step = "waiting_target";
      await ctx.editMessageText(
        orderHeader + kpayInfo + `\n\n` +
        `📋 ${bs("Target Info")} (username, link, etc.) ရိုက်ထည့်ပါ:`,
        { parse_mode: "HTML" }
      );
    } else {
      // Instant — no target needed, straight to receipt
      ctx.session.step = "waiting_receipt";
      await ctx.editMessageText(
        formatOrderSummary({
          orderId,
          serviceName: svc.name,
          itemLabel: item.label,
          price: item.price,
          unit: item.unit,
        }) +
          `\n\n${kpayInfo}\n\n` +
          `📸 ငွေလွှဲပြေစာ ဓာတ်ပုံ (သို့မဟုတ်) ငွေလွှဲ ${bs("screenshot")} ကို ဤနေရာတွင် ပို့ပေးပါ`,
        { parse_mode: "HTML" }
      );
    }
  });

  // ─── Callback: Buy Service (new-style, photo+caption services) ─
  bot.callbackQuery(/^buy_service:(.+)$/, async (ctx) => {
    const serviceId = ctx.match[1];
    const services = await getServices();
    const svc = services.find((s) => s.id === serviceId);
    if (!svc) { await ctx.answerCallbackQuery("Service မတွေ့ပါ"); return; }
    await ctx.answerCallbackQuery();

    const orderId = generateOrderId();
    const order: Order = {
      orderId,
      userId: ctx.from!.id,
      username: ctx.from?.username,
      firstName: ctx.from?.first_name,
      serviceId: svc.id,
      serviceName: svc.name,
      itemId: "service",
      itemLabel: svc.name,
      itemPrice: 0,
      status: "pending_receipt",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveOrder(order);
    ctx.session.pendingOrderId = orderId;

    const kpayInfo = `💳 <b>${bs("KPay / Wave")} နံပါတ်:</b> <code>${escHtml(KPAY_NUMBER!)}</code>`;
    const targetType = svc.targetType || "general";

    try { await ctx.deleteMessage(); } catch {}

    if (targetType === "uc") {
      ctx.session.step = "v2_waiting_player_id";
      await ctx.reply(
        `🎮 <b>${escHtml(svc.name)}</b>\n\n` +
        kpayInfo + `\n\n` +
        `📋 <b>${bs("Player ID")} (Character ID)</b> ရိုက်ထည့်ပါ:\n<i>ဥပမာ: 5123456789</i>`,
        { parse_mode: "HTML" }
      );
    } else if (targetType === "dia") {
      ctx.session.step = "v2_waiting_player_id";
      await ctx.reply(
        `💎 <b>${escHtml(svc.name)}</b>\n\n` +
        kpayInfo + `\n\n` +
        `📋 <b>${bs("Player ID")}</b> ရိုက်ထည့်ပါ:`,
        { parse_mode: "HTML" }
      );
    } else {
      ctx.session.step = "waiting_target";
      await ctx.reply(
        `📦 <b>${escHtml(svc.name)}</b>\n\n` +
        kpayInfo + `\n\n` +
        `📋 ${bs("Target Info")} (username, link, etc.) ရိုက်ထည့်ပါ:`,
        { parse_mode: "HTML" }
      );
    }
  });

  // ─── Message Handler ───────────────────────────────────────
  bot.on(["message:text", "message:photo"], async (ctx) => {
    const ownerChatId = Number(OWNER_CHAT_ID);

    // ── Owner: extract premium emoji from message ──
    if (isOwner(ctx, OWNER_CHAT_ID) && ctx.session.step === "waiting_premium_emoji") {
      const entities = ctx.message && "entities" in ctx.message ? ctx.message.entities : [];
      const customEmojiEntity = (entities || []).find((e: any) => e.type === "custom_emoji");
      if (customEmojiEntity && (customEmojiEntity as any).custom_emoji_id) {
        const emojiId = (customEmojiEntity as any).custom_emoji_id;
        const msgText = ctx.message && "text" in ctx.message ? ctx.message.text || "" : "";
        const emojiChar = [...msgText].find(c => c !== " ") || "✨";
        await setPremiumEmojiMapping(emojiChar, emojiId);
        await ctx.reply(
          `✅ <b>${bs("Premium Emoji")} သတ်မှတ်ပြီးပါပြီ!</b>\n\n` +
            `${emojiChar} → <code>${escHtml(emojiId)}</code>`,
          { parse_mode: "HTML" }
        );
        ctx.session.step = undefined;
        return;
      } else {
        await ctx.reply(
          `❌ ${bs("Custom emoji")} မတွေ့ပါ။ Premium emoji ကို တိုက်ရိုက်ပေးပို့ပါ\nသို့မဟုတ် <code>/premium [emoji] [ID]</code> သုံးပါ`,
          { parse_mode: "HTML" }
        );
        return;
      }
    }

    // ── Admin text input flow ──
    if (isOwner(ctx, OWNER_CHAT_ID) && ctx.session.adminStep) {
      await handleAdminInput(ctx);
      return;
    }

    // ── User flow: v2 — waiting Player ID (UC or Diamonds) ──
    if (ctx.session.step === "v2_waiting_player_id" && ctx.session.pendingOrderId) {
      const text = ctx.message && "text" in ctx.message ? ctx.message.text?.trim() : "";
      if (!text) return;
      const order = await getOrder(ctx.session.pendingOrderId);
      if (!order) return;
      const svc = (await getServices()).find((s) => s.id === order.serviceId);
      // Fallback: check service ID for legacy services without targetType set
      const targetType = svc?.targetType ||
        (svc?.id === "dia" ? "dia" : "uc");

      if (targetType === "dia") {
        // Save player ID, ask for server ID next
        ctx.session.collectedPlayerId = text;
        ctx.session.step = "v2_waiting_server_id";
        await ctx.reply(
          `✅ ${bs("Player ID")}: <code>${escHtml(text)}</code>\n\n` +
          `📋 <b>${bs("Server ID")}</b> ရိုက်ထည့်ပါ:\n<i>ဥပမာ: 1234</i>`,
          { parse_mode: "HTML" }
        );
      } else {
        // UC — player ID is enough, then ask for receipt
        await updateOrder(ctx.session.pendingOrderId, { targetInfo: `Player ID: ${text}` });
        ctx.session.step = "waiting_receipt";
        await ctx.reply(
          `✅ ${bs("Player ID")}: <code>${escHtml(text)}</code>\n\n` +
          `📸 <b>${bs("KPay/Wave")} ပြေစာ ဓာတ်ပုံ</b> ပို့ပေးပါ`,
          { parse_mode: "HTML" }
        );
      }
      return;
    }

    // ── User flow: v2 — waiting Server ID (Diamonds) ──
    if (ctx.session.step === "v2_waiting_server_id" && ctx.session.pendingOrderId) {
      const text = ctx.message && "text" in ctx.message ? ctx.message.text?.trim() : "";
      if (!text) return;
      const playerId = ctx.session.collectedPlayerId || "?";
      await updateOrder(ctx.session.pendingOrderId, {
        targetInfo: `Game ID: ${playerId} ${text}`,
      });
      ctx.session.step = "waiting_receipt";
      ctx.session.collectedPlayerId = undefined;
      await ctx.reply(
        `✅ <b>${bs("Game ID")}:</b> <code>${escHtml(playerId)} ${escHtml(text)}</code>\n\n` +
        `📸 <b>${bs("KPay/Wave")} ပြေစာ ဓာတ်ပုံ</b> ပို့ပေးပါ`,
        { parse_mode: "HTML" }
      );
      return;
    }

    // ── User flow: target info ──
    if (ctx.session.step === "waiting_target" && ctx.session.pendingOrderId) {
      const targetInfo = ctx.message && "text" in ctx.message ? ctx.message.text : "";
      if (!targetInfo) return;

      await updateOrder(ctx.session.pendingOrderId, { targetInfo });
      ctx.session.step = "waiting_receipt";

      const order = await getOrder(ctx.session.pendingOrderId);
      if (!order) return;

      await ctx.reply(
        formatOrderSummary({
          orderId: order.orderId,
          serviceName: order.serviceName,
          itemLabel: order.itemLabel,
          price: order.itemPrice,
          unit: "ks",
          targetInfo,
        }) +
          `\n\n💳 <b>${bs("KPay / Wave")} နံပါတ်:</b> <code>${KPAY_NUMBER}</code>\n\n` +
          `📸 ငွေလွှဲပြေစာ ဓာတ်ပုံ (သို့မဟုတ်) ${bs("screenshot")} ကို ဤနေရာတွင် ပို့ပေးပါ`,
        { parse_mode: "HTML" }
      );
      return;
    }

    // ── User flow: receipt ──
    if (ctx.session.step === "waiting_receipt" && ctx.session.pendingOrderId) {
      const order = await getOrder(ctx.session.pendingOrderId);
      if (!order) return;

      let receiptFileId: string | undefined;
      let receiptCaption: string | undefined;

      if (ctx.message && "photo" in ctx.message && ctx.message.photo) {
        const photos = ctx.message.photo;
        receiptFileId = photos[photos.length - 1].file_id;
        receiptCaption = ctx.message.caption || "";
      } else if (ctx.message && "text" in ctx.message) {
        receiptCaption = ctx.message.text;
      }

      await updateOrder(order.orderId, {
        receiptFileId,
        receiptCaption,
        status: "pending_confirm",
      });

      const waitMsg = await ctx.reply(
        `⏳ ပြေစာ စစ်ဆေးနေပါသည်...\n\nခဏလေး စောင့်ပေးပါ 🙏`,
      );
      await updateOrder(order.orderId, { messageId: waitMsg.message_id });

      const ownerNotifText = formatReceiptNotification({
        orderId: order.orderId,
        userId: order.userId,
        username: order.username,
        firstName: order.firstName,
        serviceName: order.serviceName,
        itemLabel: order.itemLabel,
        price: order.itemPrice,
        unit: "ks",
        targetInfo: order.targetInfo,
      });

      if (receiptFileId && GROUP_CHAT_ID) {
        try {
          await ctx.api.sendPhoto(GROUP_CHAT_ID, receiptFileId);
        } catch (err) {
          logger.warn({ err }, "Failed to forward receipt photo to group");
        }
      }

      let ownerMsg;
      if (receiptFileId) {
        ownerMsg = await ctx.api.sendPhoto(ownerChatId, receiptFileId, {
          caption: ownerNotifText,
          parse_mode: "HTML",
          reply_markup: ownerOrderKeyboard(order.orderId),
        });
      } else {
        ownerMsg = await ctx.api.sendMessage(ownerChatId, ownerNotifText, {
          parse_mode: "HTML",
          reply_markup: ownerOrderKeyboard(order.orderId),
        });
      }

      await updateOrder(order.orderId, { ownerMessageId: ownerMsg.message_id });
      ctx.session = {};
      return;
    }

    // ── Owner: done slip ──
    if (isOwner(ctx, OWNER_CHAT_ID) && ctx.session.step === "waiting_done_slip" && ctx.session.pendingOrderId) {
      const order = await getOrder(ctx.session.pendingOrderId);
      if (!order) return;

      const doneCaption =
        `✨ <b>${bs("Order Completed!")}</b>\n\n` +
        `🆔 ${bs("Order ID")}: <code>${escHtml(order.orderId)}</code>\n` +
        `📦 ${bs("Service")}: ${escHtml(order.serviceName)}\n` +
        `🎯 ${bs("Package")}: ${escHtml(order.itemLabel)}\n`;

      if (ctx.message && "photo" in ctx.message && ctx.message.photo) {
        const photos = ctx.message.photo;
        const fileId = photos[photos.length - 1].file_id;
        const cap = ctx.message.caption ? `\n📝 ${escHtml(ctx.message.caption)}\n` : "";
        await ctx.api.sendPhoto(order.userId, fileId, {
          caption: doneCaption + cap + mgFooter,
          parse_mode: "HTML",
          reply_markup: mgServiceButton(),
        });
      } else if (ctx.message && "text" in ctx.message) {
        await ctx.api.sendMessage(
          order.userId,
          doneCaption + `\n📝 ${escHtml(ctx.message.text)}` + mgFooter,
          { parse_mode: "HTML", reply_markup: mgServiceButton() }
        );
      }

      await updateOrder(order.orderId, { status: "completed" });
      await ctx.reply(`✅ ${bs("Done slip")} ကို ${bs("customer")} ဆီ ပေးပို့ပြီးပါပြီ!`);
      ctx.session = {};
      return;
    }

    // Default: show menu
    if (!isOwner(ctx, OWNER_CHAT_ID)) {
      const services = await getServices();
      await ctx.reply(
        `🛒 <b>${bs("Service Menu")}</b>\n\nဝယ်ယူလိုသော ${bs("service")} ကိုနှိပ်ပါ ⬇️`,
        { parse_mode: "HTML", reply_markup: mainMenuKeyboard(services) }
      );
    }
  });

  // ─── Owner Confirm ─────────────────────────────────────────
  bot.callbackQuery(/^owner:confirm:(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌ ခွင့်မပြုပါ"); return; }
    const orderId = ctx.match[1];
    const order = await getOrder(orderId);
    if (!order) { await ctx.answerCallbackQuery(`${bs("Order")} မတွေ့ပါ`); return; }
    await ctx.answerCallbackQuery(`✅ ${bs("Confirmed!")}`);

    const isInstant = order.serviceId === "dia" || order.serviceId === "uc" || order.serviceId === "tg_star";

    if (order.messageId) {
      try { await ctx.api.deleteMessage(order.userId, order.messageId); } catch {}
    }

    if (isInstant) {
      await ctx.api.sendMessage(
        order.userId,
        `✅ <b>ငွေလက်ခံရရှိပါသည်</b>\n\n` +
          `🆔 ${bs("Order ID")}: <code>${escHtml(orderId)}</code>\n` +
          `📦 ${escHtml(order.serviceName)} — ${escHtml(order.itemLabel)}\n\n` +
          `⚡ ထည့်သွင်းပြီးပါပြီ ✨` +
          mgFooter,
        { parse_mode: "HTML", reply_markup: mgServiceButton() }
      );
      await updateOrder(orderId, { status: "completed" });
      try {
        await ctx.editMessageText(
          `✅ <b>${bs("Order")} ပြီးပါပြီ</b>\n\n` +
            `🆔 <code>${escHtml(orderId)}</code>\n` +
            `📦 ${escHtml(order.serviceName)} — ${escHtml(order.itemLabel)}\n\n` +
            `⚡ ငွေလက်ခံ + Done ပြီးပါပြီ`,
          { parse_mode: "HTML" }
        );
      } catch { /* message may not be editable */ }
    } else {
      await ctx.api.sendMessage(
        order.userId,
        `✅ <b>ငွေလက်ခံရရှိပါသည်</b>\n\n` +
          `🆔 ${bs("Order ID")}: <code>${escHtml(orderId)}</code>\n` +
          `📦 ${escHtml(order.serviceName)} — ${escHtml(order.itemLabel)}\n\n` +
          `⏳ ${bs("Order")} တင်ပြီးပါပြီ၊ ခနလေး စောင့်ပေးပါ 🙏` +
          mgFooter,
        { parse_mode: "HTML", reply_markup: mgServiceButton() }
      );
      await updateOrder(orderId, { status: "processing" });
      await ctx.editMessageReplyMarkup({ reply_markup: ownerDoneKeyboard(orderId) });
    }
  });

  // ─── Owner Reject ──────────────────────────────────────────
  bot.callbackQuery(/^owner:reject:(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌ ခွင့်မပြုပါ"); return; }
    const orderId = ctx.match[1];
    const order = await getOrder(orderId);
    if (!order) { await ctx.answerCallbackQuery(`${bs("Order")} မတွေ့ပါ`); return; }
    await ctx.answerCallbackQuery(`❌ ${bs("Rejected")}`);

    if (order.messageId) {
      try { await ctx.api.deleteMessage(order.userId, order.messageId); } catch {}
    }

    await ctx.api.sendMessage(
      order.userId,
      `❌ <b>ငွေလွှဲပြေစာ လက်ခံမရရှိပါ</b>\n\n` +
        `🆔 ${bs("Order ID")}: <code>${escHtml(orderId)}</code>\n\n` +
        `📸 ငွေလွှဲပြေစာကို ပြန်လည် စစ်ဆေး၍ ထပ်မံ ပေးပို့ပေးပါ`,
      { parse_mode: "HTML" }
    );

    await updateOrder(orderId, { status: "rejected" });
    try {
      await ctx.editMessageText(
        `❌ <b>${bs("Order")} ငြင်းပယ်ပြီးပါပြီ</b>\n\n` +
          `🆔 <code>${escHtml(orderId)}</code>\n` +
          `📦 ${escHtml(order.serviceName)} — ${escHtml(order.itemLabel)}\n\n` +
          `❌ ငွေလွှဲ မတည့်ပါ`,
        { parse_mode: "HTML" }
      );
    } catch { /* message may not be editable */ }
  });

  // ─── Owner Done Slip ───────────────────────────────────────
  bot.callbackQuery(/^owner:done:(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌ ခွင့်မပြုပါ"); return; }
    const orderId = ctx.match[1];
    await ctx.answerCallbackQuery();
    ctx.session.step = "waiting_done_slip";
    ctx.session.pendingOrderId = orderId;
    try {
      await ctx.editMessageText(
        `📤 <b>${bs("Done Slip")} ပို့မည်</b>\n\n` +
          `${bs("Order ID")}: <code>${escHtml(orderId)}</code>\n\n` +
          `📸 ${bs("Done slip")} ဓာတ်ပုံ (သို့မဟုတ်) ${bs("Done")} အကြောင်းကြားချက် စာပို့ပေးပါ`,
        { parse_mode: "HTML" }
      );
    } catch {
      await ctx.reply(
        `📤 <b>${bs("Done Slip")} ပို့မည်</b>\n\n` +
          `${bs("Order ID")}: <code>${escHtml(orderId)}</code>\n\n` +
          `📸 ${bs("Done slip")} ဓာတ်ပုံ (သို့မဟုတ်) ${bs("Done")} အကြောင်းကြားချက် စာပို့ပေးပါ`,
        { parse_mode: "HTML" }
      );
    }
  });

  // ═══════════════════════════════════════════════════════════
  // ─── Admin Callbacks (Button-Based) ───────────────────────
  // ═══════════════════════════════════════════════════════════

  // ─── Admin: Back to Menu ───────────────────────────────────
  bot.callbackQuery("admin:back", async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    await ctx.answerCallbackQuery();
    ctx.session.adminStep = undefined;
    ctx.session.newService = undefined;
    ctx.session.editServiceId = undefined;
    ctx.session.editItemId = undefined;
    try {
      await ctx.editMessageText(
        `⚙️ <b>${bs("Admin Panel")}</b>\n\n${bs("Service")} များ စီမံခန့်ခွဲရန်:`,
        { parse_mode: "HTML", reply_markup: adminMenuKeyboard() }
      );
    } catch {
      await ctx.reply(
        `⚙️ <b>${bs("Admin Panel")}</b>\n\n${bs("Service")} များ စီမံခန့်ခွဲရန်:`,
        { parse_mode: "HTML", reply_markup: adminMenuKeyboard() }
      );
    }
  });

  // ─── Admin: Cancel ─────────────────────────────────────────
  bot.callbackQuery("admin:cancel", async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    await ctx.answerCallbackQuery();
    ctx.session.adminStep = undefined;
    ctx.session.newService = undefined;
    ctx.session.editServiceId = undefined;
    ctx.session.editItemId = undefined;
    try {
      await ctx.editMessageText(
        `⚙️ <b>${bs("Admin Panel")}</b>\n\n${bs("Service")} များ စီမံခန့်ခွဲရန်:`,
        { parse_mode: "HTML", reply_markup: adminMenuKeyboard() }
      );
    } catch {
      await ctx.reply(
        `⚙️ <b>${bs("Admin Panel")}</b>\n\n${bs("Service")} များ စီမံခန့်ခွဲရန်:`,
        { parse_mode: "HTML", reply_markup: adminMenuKeyboard() }
      );
    }
  });

  // ─── Admin: Service List ───────────────────────────────────
  bot.callbackQuery("admin:list", async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    await ctx.answerCallbackQuery();
    const services = await getServices();
    let text = `📋 <b>${bs("Service List")}</b>\n\n`;
    for (const svc of services) {
      text += `🔹 <b>${escHtml(svc.name)}</b>  <code>${escHtml(svc.id)}</code>\n`;
      for (const item of svc.items) {
        if (item.requireContact) {
          text += `  • ${escHtml(item.label)} — Contact\n`;
        } else {
          text += `  • ${escHtml(item.label)} — ${item.price.toLocaleString()} ks\n`;
        }
      }
      text += `\n`;
    }
    try {
      await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: adminMenuKeyboard() });
    } catch {
      await ctx.reply(text, { parse_mode: "HTML", reply_markup: adminMenuKeyboard() });
    }
  });

  // ─── Admin: Start Add Service ──────────────────────────────
  bot.callbackQuery("admin:add", async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    await ctx.answerCallbackQuery();
    ctx.session.adminStep = "add_id";
    ctx.session.newService = { items: [] };
    try {
      await ctx.editMessageText(
        `➕ <b>${bs("Service")} အသစ်ထည့်</b>\n\n` +
          `${bs("Service ID")} ရိုက်ပါ (emoji မပါဘဲ၊ underscore သုံးပါ)\n` +
          `ဥပမာ: <code>facebook_like</code>`,
        { parse_mode: "HTML" }
      );
    } catch {
      await ctx.reply(
        `➕ <b>${bs("Service")} အသစ်ထည့်</b>\n\n` +
          `${bs("Service ID")} ရိုက်ပါ (emoji မပါဘဲ၊ underscore သုံးပါ)\n` +
          `ဥပမာ: <code>facebook_like</code>`,
        { parse_mode: "HTML" }
      );
    }
  });

  // ─── Admin: Services List (for selection) ─────────────────
  bot.callbackQuery("admin:svcs", async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    await ctx.answerCallbackQuery();
    const services = await getServices();
    try {
      await ctx.editMessageText(
        `⚙️ <b>${bs("Service")} ရွေးချယ်ပါ</b>`,
        { parse_mode: "HTML", reply_markup: adminServicesKeyboard(services) }
      );
    } catch {
      await ctx.reply(
        `⚙️ <b>${bs("Service")} ရွေးချယ်ပါ</b>`,
        { parse_mode: "HTML", reply_markup: adminServicesKeyboard(services) }
      );
    }
  });

  // ─── Admin: Service Manage Menu ────────────────────────────
  bot.callbackQuery(/^admin:svc:(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    const svcId = ctx.match[1];
    const services = await getServices();
    const svc = services.find((s) => s.id === svcId);
    if (!svc) { await ctx.answerCallbackQuery("မတွေ့ပါ"); return; }
    await ctx.answerCallbackQuery();
    try {
      await ctx.editMessageText(
        `⚙️ <b>${escHtml(svc.name)}</b>\n\nBurmese: ဘာလုပ်မလဲ?`,
        { parse_mode: "HTML", reply_markup: adminServiceManageKeyboard(svc) }
      );
    } catch {
      await ctx.reply(
        `⚙️ <b>${escHtml(svc.name)}</b>\n\nဘာလုပ်မလဲ?`,
        { parse_mode: "HTML", reply_markup: adminServiceManageKeyboard(svc) }
      );
    }
  });

  // ─── Admin: Edit Name (prompt) ─────────────────────────────
  bot.callbackQuery(/^admin:name:(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    const svcId = ctx.match[1];
    await ctx.answerCallbackQuery();
    ctx.session.adminStep = "edit_name";
    ctx.session.editServiceId = svcId;
    try {
      await ctx.editMessageText(
        `✏️ <b>Service Name အသစ်</b> ရိုက်ပါ (emoji ထည့်လို့ရ):`,
        { parse_mode: "HTML" }
      );
    } catch {
      await ctx.reply(`✏️ <b>Service Name အသစ်</b> ရိုက်ပါ (emoji ထည့်လို့ရ):`, { parse_mode: "HTML" });
    }
  });

  // ─── Admin: Confirm Delete ─────────────────────────────────
  bot.callbackQuery(/^admin:del:([^_].*)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    const svcId = ctx.match[1];
    const services = await getServices();
    const svc = services.find((s) => s.id === svcId);
    if (!svc) { await ctx.answerCallbackQuery("မတွေ့ပါ"); return; }
    await ctx.answerCallbackQuery();
    try {
      await ctx.editMessageText(
        `🗑️ <b>${escHtml(svc.name)}</b> ကို ဖျက်မှာ သေချာလား?\n\nဖျက်လိုက်ရင် ပြန်မရနိုင်ပါ!`,
        { parse_mode: "HTML", reply_markup: adminConfirmDeleteKeyboard(svcId) }
      );
    } catch {
      await ctx.reply(
        `🗑️ <b>${escHtml(svc.name)}</b> ကို ဖျက်မှာ သေချာလား?`,
        { parse_mode: "HTML", reply_markup: adminConfirmDeleteKeyboard(svcId) }
      );
    }
  });

  // ─── Admin: Execute Delete ─────────────────────────────────
  bot.callbackQuery(/^admin:del_ok:(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    const svcId = ctx.match[1];
    await deleteService(svcId);
    await ctx.answerCallbackQuery(`✅ ဖျက်ပြီးပါပြီ!`);
    const services = await getServices();
    try {
      await ctx.editMessageText(
        `✅ <b>Service ဖျက်ပြီးပါပြီ</b>\n\n⚙️ <b>${bs("Admin Panel")}</b>:`,
        { parse_mode: "HTML", reply_markup: adminMenuKeyboard() }
      );
    } catch {
      await ctx.reply(
        `✅ <b>Service ဖျက်ပြီးပါပြီ</b>`,
        { parse_mode: "HTML", reply_markup: adminMenuKeyboard() }
      );
    }
  });

  // ─── Admin: Service Items List ─────────────────────────────
  bot.callbackQuery(/^admin:items:(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    const svcId = ctx.match[1];
    const services = await getServices();
    const svc = services.find((s) => s.id === svcId);
    if (!svc) { await ctx.answerCallbackQuery("မတွေ့ပါ"); return; }
    await ctx.answerCallbackQuery();
    const itemCount = svc.items.length;
    try {
      await ctx.editMessageText(
        `📦 <b>${escHtml(svc.name)}</b> — Items (${itemCount} ခု)\n\nItem တစ်ခု နှိပ်ပါ:`,
        { parse_mode: "HTML", reply_markup: adminServiceItemsKeyboard(svc) }
      );
    } catch {
      await ctx.reply(
        `📦 <b>${escHtml(svc.name)}</b> — Items (${itemCount} ခု)\n\nItem တစ်ခု နှိပ်ပါ:`,
        { parse_mode: "HTML", reply_markup: adminServiceItemsKeyboard(svc) }
      );
    }
  });

  // ─── Admin: Add Item to Existing Service (prompt) ─────────
  bot.callbackQuery(/^admin:iadd:(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    const svcId = ctx.match[1];
    const services = await getServices();
    const svc = services.find((s) => s.id === svcId);
    if (!svc) { await ctx.answerCallbackQuery("မတွေ့ပါ"); return; }
    await ctx.answerCallbackQuery();
    ctx.session.adminStep = "add_item_to_svc";
    ctx.session.editServiceId = svcId;
    const isContact = svc.category === "contact";
    const promptText =
      `➕ <b>${escHtml(svc.name)}</b> — Item အသစ်ထည့်\n\n` +
      (isContact
        ? `Label ရိုက်ပါ:\nဥပမာ: <code>Telegram Premium</code>`
        : `Format: <code>label|price</code>\nဥပမာ: <code>1,000 Likes|2000</code>`);
    try {
      await ctx.editMessageText(promptText, { parse_mode: "HTML" });
    } catch {
      await ctx.reply(promptText, { parse_mode: "HTML" });
    }
  });

  // ─── Admin: Item Manage Menu ────────────────────────────────
  bot.callbackQuery(/^admin:item:([^:]+):(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    const svcId = ctx.match[1];
    const itemId = ctx.match[2];
    const services = await getServices();
    const svc = services.find((s) => s.id === svcId);
    const item = svc?.items.find((i) => i.id === itemId);
    if (!svc || !item) { await ctx.answerCallbackQuery("မတွေ့ပါ"); return; }
    await ctx.answerCallbackQuery();
    const priceInfo = item.requireContact ? `📞 Contact` : `💰 ${item.price.toLocaleString()} ks`;
    try {
      await ctx.editMessageText(
        `📦 <b>${escHtml(item.label)}</b>\n${priceInfo}\n\nဘာလုပ်မလဲ?`,
        { parse_mode: "HTML", reply_markup: adminItemManageKeyboard(svcId, itemId) }
      );
    } catch {
      await ctx.reply(
        `📦 <b>${escHtml(item.label)}</b>\n${priceInfo}\n\nဘာလုပ်မလဲ?`,
        { parse_mode: "HTML", reply_markup: adminItemManageKeyboard(svcId, itemId) }
      );
    }
  });

  // ─── Admin: Edit Item Price (prompt) ──────────────────────
  bot.callbackQuery(/^admin:iprice:([^:]+):(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    const svcId = ctx.match[1];
    const itemId = ctx.match[2];
    await ctx.answerCallbackQuery();
    ctx.session.adminStep = "edit_price";
    ctx.session.editServiceId = svcId;
    ctx.session.editItemId = itemId;
    try {
      await ctx.editMessageText(`💰 <b>Price အသစ်</b> ရိုက်ပါ (ks):\nဥပမာ: <code>2500</code>`, { parse_mode: "HTML" });
    } catch {
      await ctx.reply(`💰 <b>Price အသစ်</b> ရိုက်ပါ (ks):\nဥပမာ: <code>2500</code>`, { parse_mode: "HTML" });
    }
  });

  // ─── Admin: Edit Item Label (prompt) ──────────────────────
  bot.callbackQuery(/^admin:ilabel:([^:]+):(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    const svcId = ctx.match[1];
    const itemId = ctx.match[2];
    await ctx.answerCallbackQuery();
    ctx.session.adminStep = "edit_label";
    ctx.session.editServiceId = svcId;
    ctx.session.editItemId = itemId;
    try {
      await ctx.editMessageText(`✏️ <b>Label အသစ်</b> ရိုက်ပါ:`, { parse_mode: "HTML" });
    } catch {
      await ctx.reply(`✏️ <b>Label အသစ်</b> ရိုက်ပါ:`, { parse_mode: "HTML" });
    }
  });

  // ─── Admin: Delete Item ────────────────────────────────────
  bot.callbackQuery(/^admin:idel:([^:]+):(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    const svcId = ctx.match[1];
    const itemId = ctx.match[2];
    const services = await getServices();
    const svc = services.find((s) => s.id === svcId);
    if (!svc) { await ctx.answerCallbackQuery("မတွေ့ပါ"); return; }
    const updatedItems = svc.items.filter((i) => i.id !== itemId);
    await updateService(svcId, { items: updatedItems });
    await ctx.answerCallbackQuery(`✅ Item ဖျက်ပြီးပါပြီ!`);
    const updatedSvc = { ...svc, items: updatedItems };
    try {
      await ctx.editMessageText(
        `📦 <b>${escHtml(svc.name)}</b> — Items (${updatedItems.length} ခု)\n\nItem တစ်ခု နှိပ်ပါ:`,
        { parse_mode: "HTML", reply_markup: adminServiceItemsKeyboard(updatedSvc) }
      );
    } catch {
      await ctx.reply(
        `✅ Item ဖျက်ပြီးပါပြီ`,
        { parse_mode: "HTML", reply_markup: adminServiceItemsKeyboard(updatedSvc) }
      );
    }
  });

  // ─── Admin: New Service — Target Type Selection ────────────
  bot.callbackQuery(/^admin:addcat:(uc|dia|general|contact)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    const targetType = ctx.match[1];
    if (!ctx.session.newService) { await ctx.answerCallbackQuery("❌ Session ပျောက်သွားပါပြီ"); return; }
    await ctx.answerCallbackQuery();
    const category = targetType === "contact" ? "contact" : "main";
    ctx.session.newService.category = category;
    ctx.session.newService.targetType = targetType;
    ctx.session.adminStep = "add_svc_photo";
    try {
      await ctx.editMessageText(
        `✅ Target Type: <b>${escHtml(targetType.toUpperCase())}</b>\n\n` +
        `📸 Service ဓာတ်ပုံ (Catalog Image) ပေးပို့ပါ\n<i>သို့မဟုတ် ကျော်နိုင်ပါသည်</i>`,
        { parse_mode: "HTML", reply_markup: adminSkipPhotoKeyboard() }
      );
    } catch {
      await ctx.reply(
        `✅ Target Type: <b>${escHtml(targetType.toUpperCase())}</b>\n\n` +
        `📸 Service ဓာတ်ပုံ (Catalog Image) ပေးပို့ပါ\n<i>သို့မဟုတ် ကျော်နိုင်ပါသည်</i>`,
        { parse_mode: "HTML", reply_markup: adminSkipPhotoKeyboard() }
      );
    }
  });

  // ─── Admin: Category Selection Button (legacy compat) ──────
  bot.callbackQuery(/^admin:cat:(main|contact)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    const category = ctx.match[1];
    if (!ctx.session.newService) { await ctx.answerCallbackQuery("❌ Session ပျောက်သွားပါပြီ"); return; }
    await ctx.answerCallbackQuery();
    ctx.session.newService.category = category;
    ctx.session.adminStep = "add_items_first";
    const isContact = category === "contact";
    const promptText =
      `📦 <b>Item ပထမဆုံးထည့်ပါ</b>\n\n` +
      (isContact
        ? `Label ရိုက်ပါ:\nဥပမာ: <code>Telegram Premium</code>`
        : `Format: <code>label|price</code>\nဥပမာ: <code>1,000 Likes|2000</code>`);
    try {
      await ctx.editMessageText(promptText, { parse_mode: "HTML" });
    } catch {
      await ctx.reply(promptText, { parse_mode: "HTML" });
    }
  });

  // ─── Admin: Set Service Media (Photo + Caption) ────────────
  bot.callbackQuery(/^admin:svc_media:(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    const svcId = ctx.match[1];
    await ctx.answerCallbackQuery();
    ctx.session.adminStep = "svc_photo";
    ctx.session.editServiceId = svcId;
    try {
      await ctx.editMessageText(
        `📸 <b>Catalog Photo</b> ပေးပို့ပါ\n<i>သို့မဟုတ် ကျော်နိုင်ပါသည်</i>`,
        { parse_mode: "HTML", reply_markup: adminSkipPhotoKeyboard() }
      );
    } catch {
      await ctx.reply(
        `📸 <b>Catalog Photo</b> ပေးပို့ပါ\n<i>သို့မဟုတ် ကျော်နိုင်ပါသည်</i>`,
        { parse_mode: "HTML", reply_markup: adminSkipPhotoKeyboard() }
      );
    }
  });

  // ─── Admin: Set Target Type (existing service) ─────────────
  bot.callbackQuery(/^admin:svc_target:(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    const svcId = ctx.match[1];
    await ctx.answerCallbackQuery();
    try {
      await ctx.editMessageText(
        `🎯 <b>Target Type ရွေးချယ်ပါ</b>`,
        { parse_mode: "HTML", reply_markup: adminTargetTypeKeyboard(svcId) }
      );
    } catch {
      await ctx.reply(`🎯 <b>Target Type ရွေးချယ်ပါ</b>`, { parse_mode: "HTML", reply_markup: adminTargetTypeKeyboard(svcId) });
    }
  });

  // ─── Admin: Confirm Target Type ────────────────────────────
  bot.callbackQuery(/^admin:target:([^:]+):(uc|dia|general|contact)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    const svcId = ctx.match[1];
    const targetType = ctx.match[2];
    const category = targetType === "contact" ? "contact" : "main";
    await updateService(svcId, { targetType, category });
    await ctx.answerCallbackQuery(`✅ Target Type: ${targetType.toUpperCase()} သတ်မှတ်ပြီးပါပြီ!`);
    const services = await getServices();
    const svc = services.find((s) => s.id === svcId);
    if (svc) {
      try {
        await ctx.editMessageText(
          `✅ <b>Target Type: ${escHtml(targetType.toUpperCase())}</b> ပြင်ပြီးပါပြီ\n\n⚙️ <b>${escHtml(svc.name)}</b>`,
          { parse_mode: "HTML", reply_markup: adminServiceManageKeyboard(svc) }
        );
      } catch {
        await ctx.reply(
          `✅ Target Type: <b>${escHtml(targetType.toUpperCase())}</b> ပြင်ပြီးပါပြီ`,
          { parse_mode: "HTML", reply_markup: adminServiceManageKeyboard(svc) }
        );
      }
    }
  });

  // ─── Admin: Skip Photo ─────────────────────────────────────
  bot.callbackQuery("admin:skip_photo", async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    await ctx.answerCallbackQuery();
    const isNewSvc = ctx.session.adminStep === "add_svc_photo";
    ctx.session.adminStep = isNewSvc ? "add_svc_caption" : "svc_caption";
    try {
      await ctx.editMessageText(
        `📝 <b>Service Caption / ဖော်ပြချက်</b> ရိုက်ပါ (HTML ထည့်လို့ရ)\n<i>သို့မဟုတ် ကျော်နိုင်ပါသည်</i>`,
        { parse_mode: "HTML", reply_markup: adminSkipCaptionKeyboard() }
      );
    } catch {
      await ctx.reply(
        `📝 <b>Service Caption / ဖော်ပြချက်</b> ရိုက်ပါ (HTML ထည့်လို့ရ)\n<i>သို့မဟုတ် ကျော်နိုင်ပါသည်</i>`,
        { parse_mode: "HTML", reply_markup: adminSkipCaptionKeyboard() }
      );
    }
  });

  // ─── Admin: Skip Caption ───────────────────────────────────
  bot.callbackQuery("admin:skip_caption", async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    await ctx.answerCallbackQuery();
    const isNewSvc = ctx.session.adminStep === "add_svc_caption";
    if (isNewSvc) {
      // Save new service without caption
      const svc = ctx.session.newService as Service;
      if (!svc?.id || !svc?.name) { return; }
      if (!svc.items) svc.items = [];
      await addService(svc);
      ctx.session.adminStep = undefined;
      ctx.session.newService = undefined;
      await ctx.answerCallbackQuery(`✅ Service ထည့်ပြီးပါပြီ!`);
      await ctx.reply(
        `✅ <b>${escHtml(svc.name)}</b> Service ထည့်ပြီးပါပြီ!`,
        { parse_mode: "HTML", reply_markup: adminMenuKeyboard() }
      );
    } else {
      // Edit existing service — skip caption update
      const svcId = ctx.session.editServiceId!;
      ctx.session.adminStep = undefined;
      ctx.session.editServiceId = undefined;
      const services = await getServices();
      const svc = services.find((s) => s.id === svcId);
      await ctx.reply(
        `✅ Caption ကျော်ပြီးပါပြီ`,
        { parse_mode: "HTML", reply_markup: svc ? adminServiceManageKeyboard(svc) : adminMenuKeyboard() }
      );
    }
  });

  // ─── Admin: Save New Service ───────────────────────────────
  bot.callbackQuery("admin:add_done", async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    const svc = ctx.session.newService as Service;
    if (!svc?.id || !svc?.name) {
      await ctx.answerCallbackQuery("❌ Service data မရှိပါ");
      return;
    }
    if (!svc.items) svc.items = [];
    await addService(svc);
    ctx.session.adminStep = undefined;
    ctx.session.newService = undefined;
    await ctx.answerCallbackQuery(`✅ Service ထည့်ပြီးပါပြီ!`);
    const summary = svc.photo ? `📸 Photo ပါ` : svc.caption ? `📝 Caption ပါ` : `Items: ${svc.items.length} ခု`;
    try {
      await ctx.editMessageText(
        `✅ <b>${escHtml(svc.name)}</b> Service ထည့်ပြီးပါပြီ!\n${summary}`,
        { parse_mode: "HTML", reply_markup: adminMenuKeyboard() }
      );
    } catch {
      await ctx.reply(
        `✅ <b>${escHtml(svc.name)}</b> Service ထည့်ပြီးပါပြီ!\n${summary}`,
        { parse_mode: "HTML", reply_markup: adminMenuKeyboard() }
      );
    }
  });

  // ═══════════════════════════════════════════════════════════
  // ─── Admin Text Input Handler ──────────────────────────────
  // ═══════════════════════════════════════════════════════════
  async function handleAdminInput(ctx: MyContext) {
    const step = ctx.session.adminStep;

    // ── Photo upload steps: handle photo messages ──
    const isPhotoStep = step === "add_svc_photo" || step === "svc_photo";
    if (isPhotoStep && ctx.message && "photo" in ctx.message && ctx.message.photo) {
      const photos = ctx.message.photo;
      const fileId = photos[photos.length - 1].file_id;
      const isNewSvc = step === "add_svc_photo";

      if (isNewSvc) {
        ctx.session.newService!.photo = fileId;
        ctx.session.adminStep = "add_svc_caption";
      } else {
        await updateService(ctx.session.editServiceId!, { photo: fileId });
        ctx.session.adminStep = "svc_caption";
      }
      await ctx.reply(
        `✅ Photo လက်ခံပြီးပါပြီ!\n\n` +
        `📝 <b>Caption / ဖော်ပြချက်</b> ရိုက်ပါ (HTML OK)\n<i>သို့မဟုတ် ကျော်နိုင်ပါသည်</i>`,
        { parse_mode: "HTML", reply_markup: adminSkipCaptionKeyboard() }
      );
      return;
    }

    const text = ctx.message && "text" in ctx.message ? ctx.message.text?.trim() : "";
    if (!text) return;

    // ── Add service: step 1 — ID ──
    if (step === "add_id") {
      const id = text.toLowerCase().replace(/[^a-z0-9_]/g, "_");
      ctx.session.newService = { id, items: [] };
      ctx.session.adminStep = "add_name";
      await ctx.reply(
        `✅ ID: <code>${escHtml(id)}</code>\n\n` +
          `<b>Service Name</b> ရိုက်ပါ (emoji ထည့်လို့ရ):\nဥပမာ: <code>🎯 Facebook Likes</code>`,
        { parse_mode: "HTML" }
      );

    // ── Add service: step 2 — Name → show target type keyboard ──
    } else if (step === "add_name") {
      ctx.session.newService!.name = text;
      ctx.session.adminStep = "add_category";
      await ctx.reply(
        `✅ Name: <b>${escHtml(text)}</b>\n\n🎯 <b>Target Type</b> ရွေးချယ်ပါ:`,
        { parse_mode: "HTML", reply_markup: adminNewSvcTargetKeyboard() }
      );

    // ── Add service: photo step — text not expected ──
    } else if (step === "add_svc_photo") {
      await ctx.reply(
        `📸 ဓာတ်ပုံ (image) ပေးပို့ပါ သို့မဟုတ် ကျော်ပါ`,
        { parse_mode: "HTML", reply_markup: adminSkipPhotoKeyboard() }
      );

    // ── Add service: caption step ──
    } else if (step === "add_svc_caption") {
      ctx.session.newService!.caption = text;
      const svc = ctx.session.newService as Service;
      if (!svc.items) svc.items = [];
      await addService(svc);
      ctx.session.adminStep = undefined;
      ctx.session.newService = undefined;
      await ctx.reply(
        `✅ <b>${escHtml(svc.name)}</b> Service ထည့်ပြီးပါပြီ!\n📝 Caption ပါ`,
        { parse_mode: "HTML", reply_markup: adminMenuKeyboard() }
      );

    // ── Edit service: photo step — text not expected ──
    } else if (step === "svc_photo") {
      await ctx.reply(
        `📸 ဓာတ်ပုံ (image) ပေးပို့ပါ သို့မဟုတ် ကျော်ပါ`,
        { parse_mode: "HTML", reply_markup: adminSkipPhotoKeyboard() }
      );

    // ── Edit service: caption step ──
    } else if (step === "svc_caption") {
      const svcId = ctx.session.editServiceId!;
      await updateService(svcId, { caption: text });
      ctx.session.adminStep = undefined;
      ctx.session.editServiceId = undefined;
      const services = await getServices();
      const svc = services.find((s) => s.id === svcId);
      await ctx.reply(
        `✅ Caption ပြင်ပြီးပါပြီ`,
        { parse_mode: "HTML", reply_markup: svc ? adminServiceManageKeyboard(svc) : adminMenuKeyboard() }
      );

    // ── Add service: items (first or more) ──
    } else if (step === "add_items_first" || step === "add_items_more") {
      const isContact = ctx.session.newService?.category === "contact";
      let newItem: ServiceItem;

      if (isContact) {
        newItem = {
          id: `${ctx.session.newService!.id}_${Date.now()}`,
          label: text,
          price: 0,
          unit: "",
          requireContact: true,
        };
      } else {
        const parts = text.split("|");
        if (parts.length < 2) {
          await ctx.reply(
            `❌ Format မှား — <code>label|price</code> ဖြင့်ထည့်ပါ\nဥပမာ: <code>1,000 Likes|2000</code>`,
            { parse_mode: "HTML" }
          );
          return;
        }
        const label = parts[0].trim();
        const price = parseInt(parts[1].trim().replace(/[^0-9]/g, ""), 10);
        newItem = {
          id: `${ctx.session.newService!.id}_${Date.now()}`,
          label,
          price,
          unit: "ks",
        };
      }

      ctx.session.newService!.items = [...(ctx.session.newService!.items || []), newItem];
      ctx.session.adminStep = "add_items_more";
      const count = ctx.session.newService!.items!.length;
      await ctx.reply(
        `✅ "<b>${escHtml(newItem.label)}</b>" ထည့်ပြီး (စုစုပေါင်း ${count} ခု)\n\nဆက်ထည့်နိုင်သည် သို့မဟုတ် ပြီးပြီ နှိပ်ပါ:`,
        { parse_mode: "HTML", reply_markup: adminAddMoreItemsKeyboard() }
      );

    // ── Edit service name ──
    } else if (step === "edit_name") {
      const svcId = ctx.session.editServiceId!;
      await updateService(svcId, { name: text });
      ctx.session.adminStep = undefined;
      ctx.session.editServiceId = undefined;
      const services = await getServices();
      const svc = services.find((s) => s.id === svcId);
      await ctx.reply(
        `✅ Service Name "<b>${escHtml(text)}</b>" ပြင်ပြီးပါပြီ`,
        { parse_mode: "HTML", reply_markup: svc ? adminServiceManageKeyboard(svc) : adminMenuKeyboard() }
      );

    // ── Add item to existing service ──
    } else if (step === "add_item_to_svc") {
      const svcId = ctx.session.editServiceId!;
      const services = await getServices();
      const svc = services.find((s) => s.id === svcId);
      if (!svc) return;

      const isContact = svc.category === "contact";
      let newItem: ServiceItem;

      if (isContact) {
        newItem = {
          id: `${svcId}_${Date.now()}`,
          label: text,
          price: 0,
          unit: "",
          requireContact: true,
        };
      } else {
        const parts = text.split("|");
        if (parts.length < 2) {
          await ctx.reply(
            `❌ Format မှား — <code>label|price</code>\nဥပမာ: <code>1,000 Likes|2000</code>`,
            { parse_mode: "HTML" }
          );
          return;
        }
        const label = parts[0].trim();
        const price = parseInt(parts[1].trim().replace(/[^0-9]/g, ""), 10);
        newItem = { id: `${svcId}_${Date.now()}`, label, price, unit: "ks" };
      }

      const updatedItems = [...svc.items, newItem];
      await updateService(svcId, { items: updatedItems });
      ctx.session.adminStep = undefined;
      ctx.session.editServiceId = undefined;
      const updatedSvc = { ...svc, items: updatedItems };
      await ctx.reply(
        `✅ "<b>${escHtml(newItem.label)}</b>" ထည့်ပြီးပါပြီ`,
        { parse_mode: "HTML", reply_markup: adminServiceItemsKeyboard(updatedSvc) }
      );

    // ── Edit item price ──
    } else if (step === "edit_price") {
      const newPrice = parseInt(text.replace(/[^0-9]/g, ""), 10);
      const svcId = ctx.session.editServiceId!;
      const itemId = ctx.session.editItemId!;
      const services = await getServices();
      const svc = services.find((s) => s.id === svcId);
      if (svc) {
        const items = svc.items.map((it) =>
          it.id === itemId ? { ...it, price: newPrice } : it
        );
        await updateService(svcId, { items });
        ctx.session.adminStep = undefined;
        ctx.session.editItemId = undefined;
        const updatedSvc = { ...svc, items };
        await ctx.reply(
          `✅ Price <b>${newPrice.toLocaleString()} ks</b> ပြင်ပြီးပါပြီ`,
          { parse_mode: "HTML", reply_markup: adminServiceItemsKeyboard(updatedSvc) }
        );
      }

    // ── Edit item label ──
    } else if (step === "edit_label") {
      const svcId = ctx.session.editServiceId!;
      const itemId = ctx.session.editItemId!;
      const services = await getServices();
      const svc = services.find((s) => s.id === svcId);
      if (svc) {
        const items = svc.items.map((it) =>
          it.id === itemId ? { ...it, label: text } : it
        );
        await updateService(svcId, { items });
        ctx.session.adminStep = undefined;
        ctx.session.editItemId = undefined;
        const updatedSvc = { ...svc, items };
        await ctx.reply(
          `✅ Label "<b>${escHtml(text)}</b>" ပြင်ပြီးပါပြီ`,
          { parse_mode: "HTML", reply_markup: adminServiceItemsKeyboard(updatedSvc) }
        );
      }
    }
  }

  bot.catch((err) => {
    logger.error({ err: err.error, update: err.ctx?.update }, "Bot error");
  });

  return bot;
}
