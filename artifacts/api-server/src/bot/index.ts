import { Bot, Context, session, SessionFlavor, InlineKeyboard } from "grammy";
import { JsonDbSessionStorage } from "./session-storage";
import { logger } from "../lib/logger";
import {
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
  setPremiumEmojiMapping,
  removePremiumEmojiMapping,
  getPremiumEmojiMap,
} from "./emojis";
import {
  mainMenuKeyboard,
  serviceItemsKeyboard,
  ownerOrderKeyboard,
  ownerDoneKeyboard,
  adminMenuKeyboard,
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
  editField?: string;
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
            p[field] = replaced;
            p.parse_mode = "HTML";
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
        `👤 ${bs("Owner")} သို့ဆက်သွယ်ရန်: <a href="https://t.me/Mg_Piizza">@Mg_Piizza</a>\n\n` +
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

    // /premium list
    if (parts[0] === "list") {
      const map = await getPremiumEmojiMap();
      if (map.size === 0) {
        await ctx.reply(`📋 ${bs("Premium emoji")} မသတ်မှတ်ရသေးပါ`, { parse_mode: "HTML" });
        return;
      }
      let text = `📋 <b>${bs("Premium Emoji Mappings")}</b>\n\n`;
      for (const [emoji, id] of map.entries()) {
        text += `${emoji} → <code>${escHtml(id)}</code>\n`;
      }
      await ctx.reply(text, { parse_mode: "HTML" });
      return;
    }

    // /premium clear ⭐
    if (parts[0] === "clear" && parts[1]) {
      await removePremiumEmojiMapping(parts[1]);
      await ctx.reply(`✅ <code>${escHtml(parts[1])}</code> mapping ဖျက်ပြီးပါပြီ`, { parse_mode: "HTML" });
      return;
    }

    // /premium ⭐ 5368324170671202286
    if (parts.length >= 2) {
      const emoji = parts[0];
      const id = parts[1];
      await setPremiumEmojiMapping(emoji, id);
      await ctx.reply(
        `✅ <b>${bs("Premium Emoji")} သတ်မှတ်ပြီးပါပြီ!</b>\n\n` +
          `${emoji} → <code>${escHtml(id)}</code>\n\n` +
          `ယခုမှစ၍ message များမှ <b>${emoji}</b> အားလုံး premium emoji အဖြစ် auto ပြောင်းသွားမည်`,
        { parse_mode: "HTML" }
      );
      return;
    }

    // No args — show usage
    await ctx.reply(
      `⭐ <b>${bs("Premium Emoji")} Usage</b>\n\n` +
        `<b>ထည့်ရန်:</b>\n<code>/premium ⭐ 5368324170671202286</code>\n\n` +
        `<b>List ကြည့်ရန်:</b>\n<code>/premium list</code>\n\n` +
        `<b>ဖျက်ရန်:</b>\n<code>/premium clear ⭐</code>\n\n` +
        `💡 Emoji ID ကို BotFather → Emoji Status / Sticker Set မှ ယူနိုင်သည်\n` +
        `သို့မဟုတ် premium emoji တစ်ခု ဒီ chat ထဲ send လုပ်ပါ — bot က auto-detect လုပ်မည်`,
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

  // ─── Callback: Back to Main ────────────────────────────────
  bot.callbackQuery("back:main", async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session = {};
    const services = await getServices();
    await ctx.editMessageText(
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
        `👤 <a href="https://t.me/Mg_Piizza">@Mg_Piizza</a> — ${bs("Owner")}\n\n` +
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
    ctx.session.step = "waiting_target";

    const needsTarget =
      svc.id === "tg_boost" || svc.id === "tiktok" || svc.id === "tg_star";

    if (needsTarget) {
      let promptText = "";
      if (svc.id === "tg_boost") {
        promptText = `📢 ${bs("Channel/Group username")} ပေးပို့ပါ\n<code>(ဥပမာ: @mychannel)</code>`;
      } else if (svc.id === "tiktok") {
        promptText = `🎵 ${bs("TikTok Post/Profile Link")} ပေးပို့ပါ`;
      } else if (svc.id === "tg_star") {
        promptText = `⭐ ${bs("Telegram username")} ပေးပို့ပါ\n<code>(ဥပမာ: @myusername)</code>`;
      }

      await ctx.editMessageText(
        `✅ <b>${bs("Package")} ရွေးချယ်ပြီးပါပြီ!</b>\n\n` +
          `📦 ${bs("Service")}: <b>${escHtml(svc.name)}</b>\n` +
          `🎯 ${bs("Package")}: ${escHtml(item.label)}\n` +
          `💰 ငွေပမာဏ: <b>${item.price.toLocaleString()} ks</b>\n\n` +
          `${promptText}`,
        { parse_mode: "HTML" }
      );
    } else {
      ctx.session.step = "waiting_receipt";
      await ctx.editMessageText(
        formatOrderSummary({
          orderId,
          serviceName: svc.name,
          itemLabel: item.label,
          price: item.price,
          unit: item.unit,
        }) +
          `\n\n💳 <b>${bs("KPay / Wave")} နံပါတ်:</b> <code>${KPAY_NUMBER}</code>\n\n` +
          `📸 ငွေလွှဲပြေစာ ဓာတ်ပုံ (သို့မဟုတ်) ငွေလွှဲ ${bs("screenshot")} ကို ဤနေရာတွင် ပို့ပေးပါ`,
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
          `❌ ${bs("Custom emoji")} မတွေ့ပါ။ Premium emoji ကို တိုက်ရိုက်ပေးပို့ပါ\nသို့မဟုတ် <code>/premium [ID]</code> သုံးပါ`,
          { parse_mode: "HTML" }
        );
        return;
      }
    }

    // ── Admin flow ──
    if (isOwner(ctx, OWNER_CHAT_ID) && ctx.session.adminStep) {
      await handleAdminInput(ctx, ownerChatId);
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

      // ── GP group: receipt photo only (no caption) ──
      if (receiptFileId && GROUP_CHAT_ID) {
        try {
          await ctx.api.sendPhoto(GROUP_CHAT_ID, receiptFileId);
        } catch (err) {
          logger.warn({ err }, "Failed to forward receipt photo to group");
        }
      }

      // ── Owner DM: full notification with confirm/reject buttons ──
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
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.reply(`✅ ${bs("Order")} <code>${escHtml(orderId)}</code> — ငွေလက်ခံ + ${bs("Done")} ပြီးပါပြီ`, { parse_mode: "HTML" });
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
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    await ctx.reply(`❌ ${bs("Order")} <code>${escHtml(orderId)}</code> — ငွေလွှဲ မတည့်ပါ`, { parse_mode: "HTML" });
  });

  // ─── Owner Done Slip ───────────────────────────────────────
  bot.callbackQuery(/^owner:done:(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌ ခွင့်မပြုပါ"); return; }
    const orderId = ctx.match[1];
    await ctx.answerCallbackQuery();
    ctx.session.step = "waiting_done_slip";
    ctx.session.pendingOrderId = orderId;
    await ctx.reply(
      `📤 <b>${bs("Done Slip")} ပို့မည်</b>\n\n` +
        `${bs("Order ID")}: <code>${escHtml(orderId)}</code>\n\n` +
        `📸 ${bs("Done slip")} ဓာတ်ပုံ (သို့မဟုတ်) ${bs("Done")} အကြောင်းကြားချက် စာပို့ပေးပါ`,
      { parse_mode: "HTML" }
    );
  });

  // ─── Admin Callbacks ───────────────────────────────────────
  bot.callbackQuery("admin:list", async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    await ctx.answerCallbackQuery();
    const services = await getServices();
    let text = `📋 <b>${bs("Service List")}</b>\n\n`;
    for (const svc of services) {
      text += `🔹 <b>${escHtml(svc.name)}</b> (<${bs("ID")}: <code>${escHtml(svc.id)}</code>)\n`;
      for (const item of svc.items) {
        if (item.requireContact) {
          text += `  • ${escHtml(item.label)} — ${bs("Contact")}\n`;
        } else {
          text += `  • ${escHtml(item.label)} — ${item.price.toLocaleString()} ks\n`;
        }
      }
      text += `\n`;
    }
    await ctx.reply(text, { parse_mode: "HTML" });
  });

  bot.callbackQuery("admin:add", async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    await ctx.answerCallbackQuery();
    ctx.session.adminStep = "add_service_id";
    ctx.session.newService = {};
    await ctx.reply(
      `➕ <b>${bs("Service")} အသစ်ထည့်</b>\n\n` +
        `${bs("Service ID")} ရိုက်ထည့်ပါ (emoji မပါဘဲ, underscore သုံးပါ)\n` +
        `ဥပမာ: <code>facebook_like</code>`,
      { parse_mode: "HTML" }
    );
  });

  bot.callbackQuery("admin:edit", async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    await ctx.answerCallbackQuery();
    ctx.session.adminStep = "edit_choose_service";
    const services = await getServices();
    let text = `✏️ <b>ဘယ် ${bs("Service")} ပြင်မလဲ?</b>\n\n${bs("Service ID")} ရိုက်ပါ:\n\n`;
    for (const s of services) {
      text += `• <code>${escHtml(s.id)}</code> — ${escHtml(s.name)}\n`;
    }
    await ctx.reply(text, { parse_mode: "HTML" });
  });

  bot.callbackQuery("admin:delete", async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    await ctx.answerCallbackQuery();
    ctx.session.adminStep = "delete_service";
    const services = await getServices();
    let text = `🗑️ <b>ဘယ် ${bs("Service")} ဖျက်မလဲ?</b>\n\n${bs("Service ID")} ရိုက်ပါ:\n\n`;
    for (const s of services) {
      text += `• <code>${escHtml(s.id)}</code> — ${escHtml(s.name)}\n`;
    }
    await ctx.reply(text, { parse_mode: "HTML" });
  });

  // ─── Admin Input Handler ───────────────────────────────────
  async function handleAdminInput(ctx: MyContext, ownerChatId: number) {
    const text = ctx.message && "text" in ctx.message ? ctx.message.text?.trim() : "";
    if (!text) return;
    const step = ctx.session.adminStep;

    if (step === "add_service_id") {
      ctx.session.newService = { id: text, items: [] };
      ctx.session.adminStep = "add_service_name";
      await ctx.reply(
        `${bs("Service Name")} (emoji ထည့်လို့ရ) ရိုက်ပါ:\nဥပမာ: <code>🎯 Facebook Likes</code>`,
        { parse_mode: "HTML" }
      );
    } else if (step === "add_service_name") {
      ctx.session.newService!.name = text;
      ctx.session.adminStep = "add_service_category";
      await ctx.reply(
        `${bs("Category")} ရွေးပါ:\n\n<code>main</code> — ငွေပေးပြီး ${bs("order")} တင်\n<code>contact</code> — ${bs("owner")} ဆီ တိုက်ရိုက်ဆက်သွယ်`,
        { parse_mode: "HTML" }
      );
    } else if (step === "add_service_category") {
      ctx.session.newService!.category = text === "contact" ? "contact" : "main";
      ctx.session.adminStep = "add_service_items";
      await ctx.reply(
        `${bs("Items")} ထည့်ပါ (တစ်ကြောင်းချင်း):\n\n${bs("Format")}: <code>label|price</code>\nဥပမာ: <code>1,000 Likes|2000</code>\n\nပြီးရင် <code>done</code> ရိုက်ပါ`,
        { parse_mode: "HTML" }
      );
    } else if (step === "add_service_items") {
      if (text.toLowerCase() === "done") {
        const svc = ctx.session.newService as Service;
        if (!svc.items || svc.items.length === 0) {
          await ctx.reply(`❌ ${bs("Item")} အနည်းဆုံး ၁ ခုထည့်ပါ`);
          return;
        }
        await addService(svc);
        ctx.session.adminStep = undefined;
        ctx.session.newService = undefined;
        await ctx.reply(`✅ <b>${escHtml(svc.name)}</b> ${bs("Service")} ထည့်ပြီးပါပြီ!`, { parse_mode: "HTML" });
      } else {
        const parts = text.split("|");
        if (parts.length < 2) {
          await ctx.reply(`❌ ${bs("Format")} မှား။ <code>label|price</code> ဖြင့်ပြန်ရိုက်ပါ`, { parse_mode: "HTML" });
          return;
        }
        const label = parts[0].trim();
        const price = parseInt(parts[1].trim().replace(/[^0-9]/g, ""), 10);
        const item: ServiceItem = {
          id: `${ctx.session.newService!.id}_${Date.now()}`,
          label, price, unit: "ks",
          requireContact: ctx.session.newService!.category === "contact",
        };
        ctx.session.newService!.items = [...(ctx.session.newService!.items || []), item];
        await ctx.reply(`✅ "${escHtml(label)}" ထည့်ပြီး။ ဆက်ထည့်နိုင်သည်၊ ပြီးရင် <code>done</code>`, { parse_mode: "HTML" });
      }
    } else if (step === "edit_choose_service") {
      const services = await getServices();
      const svc = services.find((s) => s.id === text);
      if (!svc) { await ctx.reply(`❌ ${bs("Service ID")} မတွေ့ပါ`); return; }
      ctx.session.editServiceId = text;
      ctx.session.adminStep = "edit_choose_field";
      await ctx.reply(
        `✏️ <b>${escHtml(svc.name)}</b> — ဘာပြင်မလဲ?\n\n<code>name</code> — ${bs("Service Name")}\n<code>price</code> — ${bs("Item Price")}\n<code>item_add</code> — ${bs("Item")} ထည့်\n<code>item_del</code> — ${bs("Item")} ဖျက်`,
        { parse_mode: "HTML" }
      );
    } else if (step === "edit_choose_field") {
      ctx.session.editField = text;
      const services = await getServices();
      const svc = services.find((s) => s.id === ctx.session.editServiceId);
      if (!svc) return;

      if (text === "name") {
        ctx.session.adminStep = "edit_set_name";
        await ctx.reply(`${bs("Service Name")} အသစ် ရိုက်ပါ:`);
      } else if (text === "price") {
        ctx.session.adminStep = "edit_choose_item";
        let txt = `${bs("Item")} ရွေးပါ (${bs("ID")} ရိုက်):\n\n`;
        for (const it of svc.items) {
          txt += `• <code>${escHtml(it.id)}</code> — ${escHtml(it.label)} (${it.price.toLocaleString()} ks)\n`;
        }
        await ctx.reply(txt, { parse_mode: "HTML" });
      } else if (text === "item_add") {
        ctx.session.adminStep = "edit_add_item";
        ctx.session.newService = svc;
        await ctx.reply(`${bs("Item")} အသစ် ထည့်ပါ:\n\n${bs("Format")}: <code>label|price</code>`, { parse_mode: "HTML" });
      } else if (text === "item_del") {
        ctx.session.adminStep = "edit_del_item";
        let txt = `ဖျက်မည့် ${bs("Item ID")} ရိုက်ပါ:\n\n`;
        for (const it of svc.items) {
          txt += `• <code>${escHtml(it.id)}</code> — ${escHtml(it.label)}\n`;
        }
        await ctx.reply(txt, { parse_mode: "HTML" });
      }
    } else if (step === "edit_set_name") {
      await updateService(ctx.session.editServiceId!, { name: text });
      ctx.session.adminStep = undefined;
      await ctx.reply(`✅ ${bs("Service Name")} "${escHtml(text)}" ပြင်ပြီးပါပြီ`, { parse_mode: "HTML" });
    } else if (step === "edit_choose_item") {
      ctx.session.adminStep = "edit_set_price";
      ctx.session.editField = text;
      await ctx.reply(`${bs("Price")} အသစ် ရိုက်ပါ (ks):`);
    } else if (step === "edit_set_price") {
      const newPrice = parseInt(text.replace(/[^0-9]/g, ""), 10);
      const services = await getServices();
      const svc = services.find((s) => s.id === ctx.session.editServiceId);
      if (svc) {
        const items = svc.items.map((it) =>
          it.id === ctx.session.editField ? { ...it, price: newPrice } : it
        );
        await updateService(ctx.session.editServiceId!, { items });
      }
      ctx.session.adminStep = undefined;
      await ctx.reply(`✅ ${bs("Price")} ${newPrice.toLocaleString()} ks ပြင်ပြီးပါပြီ`);
    } else if (step === "edit_add_item") {
      const parts = text.split("|");
      if (parts.length < 2) {
        await ctx.reply(`❌ ${bs("Format")} မှား — <code>label|price</code>`, { parse_mode: "HTML" });
        return;
      }
      const label = parts[0].trim();
      const price = parseInt(parts[1].trim().replace(/[^0-9]/g, ""), 10);
      const svc = ctx.session.newService!;
      const newItem: ServiceItem = { id: `${svc.id}_${Date.now()}`, label, price, unit: "ks" };
      const items = [...(svc.items ?? []), newItem];
      await updateService(svc.id!, { items });
      ctx.session.adminStep = undefined;
      await ctx.reply(`✅ "${escHtml(label)}" ${bs("Item")} ထည့်ပြီးပါပြီ`, { parse_mode: "HTML" });
    } else if (step === "edit_del_item") {
      const services = await getServices();
      const svc = services.find((s) => s.id === ctx.session.editServiceId);
      if (svc) {
        const items = svc.items.filter((it) => it.id !== text);
        await updateService(svc.id, { items });
      }
      ctx.session.adminStep = undefined;
      await ctx.reply(`✅ ${bs("Item")} ဖျက်ပြီးပါပြီ`);
    } else if (step === "delete_service") {
      await deleteService(text);
      ctx.session.adminStep = undefined;
      await ctx.reply(`✅ ${bs("Service")} <code>${escHtml(text)}</code> ဖျက်ပြီးပါပြီ`, { parse_mode: "HTML" });
    }
  }

  bot.catch((err) => {
    logger.error({ err: err.error, update: err.ctx?.update }, "Bot error");
  });

  return bot;
}
