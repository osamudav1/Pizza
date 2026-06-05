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
  addOrgPrice,
  clearOrgPrices,
  getWelcomeMedia,
  setWelcomeMedia,
  trackUser,
  getTotalUserCount,
  type Order,
  type Service,
  type ServiceItem,
} from "./db";
import {
  applyPremiumEmojis,
  extractFirstEmoji,
  loadPremiumEmojis,
  setPremiumEmoji,
  removePremiumEmoji,
  clearPremiumEmojis,
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
  adminOrgPriceKeyboard,
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
  premium_emoji_step?: string;
  premium_original_emoji?: string;
  welcome_media_step?: string;
}

type MyContext = Context & SessionFlavor<SessionData>;

const BOT_TOKEN = process.env["BOT_TOKEN"];
const OWNER_CHAT_ID = process.env["OWNER_CHAT_ID"] || "";
const KPAY_NUMBER = process.env["KPAY_NUMBER"] || "";
const GROUP_CHAT_ID = process.env["GROUP_CHAT_ID"] || "";

function escHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Converts a telegram message with entities into an HTML string.
 */
function messageToHtml(text: string, entities: any[] = []): string {
  if (!entities || entities.length === 0) return escHtml(text);

  let html = "";
  let lastOffset = 0;

  // Sort entities by offset
  const sortedEntities = [...entities].sort((a, b) => a.offset - b.offset);

  for (const entity of sortedEntities) {
    // Add text before the entity
    html += escHtml(text.substring(lastOffset, entity.offset));

    const entityText = text.substring(entity.offset, entity.offset + entity.length);
    const escapedEntityText = escHtml(entityText);

    switch (entity.type) {
      case "bold":
        html += `<b>${escapedEntityText}</b>`;
        break;
      case "italic":
        html += `<i>${escapedEntityText}</i>`;
        break;
      case "code":
        html += `<code>${escapedEntityText}</code>`;
        break;
      case "pre":
        html += `<pre>${escapedEntityText}</pre>`;
        break;
      case "underline":
        html += `<u>${escapedEntityText}</u>`;
        break;
      case "strikethrough":
        html += `<s>${escapedEntityText}</s>`;
        break;
      case "text_link":
        html += `<a href="${entity.url}">${escapedEntityText}</a>`;
        break;
      case "url":
        html += `<a href="${entityText}">${escapedEntityText}</a>`;
        break;
      case "mention":
        html += `<a href="https://t.me/${entityText.substring(1)}">${escapedEntityText}</a>`;
        break;
      case "custom_emoji":
        html += `<tg-emoji emoji-id="${entity.custom_emoji_id}">${escapedEntityText}</tg-emoji>`;
        break;
      default:
        html += escapedEntityText;
    }
    lastOffset = entity.offset + entity.length;
  }

  // Add remaining text
  html += escHtml(text.substring(lastOffset));
  return html;
}

export async function createBot() {
  logger.info("[Bot] createBot() — initializing...");
  if (!BOT_TOKEN) {
    logger.error("BOT_TOKEN environment variable is missing. Bot will not start.");
    throw new Error("BOT_TOKEN environment variable is required");
  }
  const bot = new Bot<MyContext>(BOT_TOKEN);

  // ─── Load premium emojis from DB into in-memory map ─────────
  logger.info("[Bot] Loading premium emojis from DB...");
  await loadPremiumEmojis();
  logger.info("[Bot] Premium emojis loaded");

  // ─── Premium Emoji Transformer ─────────────────────────────
  bot.api.config.use((prev, method, payload, signal) => {
    const p = payload as any;
    if (p) {
      // Top-level text or caption (sendMessage, sendPhoto, editMessageText, editMessageCaption, etc.)
      if (typeof p.text === "string" || typeof p.caption === "string") {
        const targetField = typeof p.text === "string" ? "text" : "caption";
        const originalText = p[targetField];
        const replacedText = applyPremiumEmojis(originalText);
        if (replacedText !== originalText) {
          p[targetField] = replacedText;
          p.parse_mode = "HTML";
        }
      }
      // Nested caption inside editMessageMedia — p.media.caption
      if (p.media && typeof p.media.caption === "string") {
        const originalCaption = p.media.caption;
        const replacedCaption = applyPremiumEmojis(originalCaption);
        if (replacedCaption !== originalCaption) {
          p.media.caption = replacedCaption;
          p.media.parse_mode = "HTML";
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

  // Global Error Handler to prevent bot from crashing
  bot.catch((err) => {
    const ctx = err.ctx;
    logger.error({ 
      err: err.error, 
      updateId: ctx.update.update_id,
      userId: ctx.from?.id 
    }, "[BotError] Error in bot execution");
  });

  // ─── /start ───────────────────────────────────────────────
  bot.command("start", async (ctx) => {
    logger.info({ userId: ctx.from?.id, username: ctx.from?.username, chatType: ctx.chat.type }, "[/start] Command received");
    if (ctx.chat.type !== "private") {
      logger.debug({ chatType: ctx.chat.type }, "[/start] Ignored — not a private chat");
      return;
    }
    ctx.session = {};

    // Track user and notify owner if new
    if (ctx.from) {
      const isNew = await trackUser(ctx.from.id, ctx.from.username, ctx.from.first_name);
      if (isNew && OWNER_CHAT_ID) {
        const totalUsers = await getTotalUserCount();
        const mention = ctx.from.username 
          ? `@${ctx.from.username}` 
          : `<a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name}</a>`;
        
        const notification = `🆕 <b>New User Joined!</b>\n\n` +
          `👤 <b>User:</b> ${mention}\n` +
          `🆔 <b>ID:</b> <code>${ctx.from.id}</code>\n\n` +
          `📊 <b>Total Users:</b> ${totalUsers}`;
        
        bot.api.sendMessage(OWNER_CHAT_ID, notification, { parse_mode: "HTML" }).catch(err => {
          logger.error({ err, ownerId: OWNER_CHAT_ID }, "Failed to send new user notification to owner");
        });
      }
    }
    
    logger.debug({ userId: ctx.from?.id }, "[/start] Fetching services and welcome media...");
    // Optimize: Fetch services and welcome media in parallel
    const [services, welcome] = await Promise.all([
      getServices(),
      getWelcomeMedia()
    ]);
    logger.info({ userId: ctx.from?.id, serviceCount: services.length, hasWelcome: !!welcome }, "[/start] Data loaded");

    const defaultCaption = `✨ <b>မင်္ဂလာပါ 🍕 ${bs("Mg Pizza Store")} မှ ကြိုဆိုပါသည်!</b>\n\n` +
      `👤 ${bs("Owner")} သို့ဆက်သွယ်ရန်: <a href="https://t.me/Mg_Piizzaa">@Mg_Piizzaa</a>\n\n` +
      `🛒 ${bs("Service")} များဝယ်ယူရန် တစ်ခုရွေးချယ်ပါ ⬇️`;
    
    let caption = welcome?.caption || defaultCaption;
    
    // Welcome caption formatting
    if (caption.includes("{mention}")) {
      const mention = ctx.from?.username ? `@${ctx.from.username}` : `<a href="tg://user?id=${ctx.from?.id}">${ctx.from?.first_name}</a>`;
      caption = caption.replace(/{mention}/g, mention);
    }
    if (caption.includes("{name}")) {
      caption = caption.replace(/{name}/g, ctx.from?.first_name || "User");
    }
    if (caption.includes("{id}")) {
      caption = caption.replace(/{id}/g, ctx.from?.id.toString() || "");
    }

    const replyOptions = {
      parse_mode: "HTML" as const,
      reply_markup: mainMenuKeyboard(services),
    };

    try {
      if (welcome?.photo) {
        try {
          await ctx.replyWithPhoto(welcome.photo, {
            ...replyOptions,
            caption,
          });
        } catch (photoErr) {
          logger.warn({ photoErr, userId: ctx.from?.id }, "[/start] Failed to send welcome photo, falling back to text");
          await ctx.reply(caption, replyOptions);
        }
      } else {
        await ctx.reply(caption, replyOptions);
      }
      logger.info({ userId: ctx.from?.id }, "[/start] Reply sent successfully");
    } catch (sendErr) {
      logger.error({ sendErr, userId: ctx.from?.id }, "[/start] Failed to send reply");
      throw sendErr;
    }
  });

  // ─── /menu ────────────────────────────────────────────────
  bot.command("menu", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    ctx.session = {};
    const services = await getServices();
    await ctx.reply(
      `🛒 <b>${bs("Service Menu")}</b>\n\nဝယ်ယူလိုသော ${bs("service")} ကိုနှိပ်ပါ ⬇️`,
      { parse_mode: "HTML", reply_markup: mainMenuKeyboard(services) }
    );
  });

  // ─── /admin ───────────────────────────────────────────────
  bot.command("admin", async (ctx) => {
    if (ctx.chat.type !== "private") return;
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

  // ─── /stats ───────────────────────────────────────────────
  bot.command("stats", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    if (!isOwner(ctx, OWNER_CHAT_ID)) {
      await ctx.reply("❌ ခွင့်မပြုပါ");
      return;
    }
    
    const totalUsers = await getTotalUserCount();
    await ctx.reply(
      `📊 <b>${bs("Bot Statistics")}</b>\n\n` +
      `👥 <b>Total Users:</b> ${totalUsers}`,
      { parse_mode: "HTML" }
    );
  });

  // ─── /premium ─────────────────────────────────────────────
  bot.command("premium", async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) {
      await ctx.reply("❌ ခွင့်မပြုပါ");
      return;
    }
    const arg = ctx.match?.trim() || "";
    const lower = arg.toLowerCase();

    // ── clear all ──
    if (lower === "clear") {
      const count = await clearPremiumEmojis();
      await ctx.reply(`✅ Mapping အကုန် ဖျက်ပြီးပါပြီ (${count} ခု)`, { parse_mode: "HTML" });
      return;
    }

    // ── remove one ──
    if (lower.startsWith("remove ") || lower.startsWith("del ")) {
      const emoji = arg.slice(lower.startsWith("remove ") ? 7 : 4).trim();
      if (!emoji) {
        await ctx.reply("❌ ဥပမာ: <code>/premium remove 🛒</code>", { parse_mode: "HTML" });
        return;
      }
      const removed = await removePremiumEmoji(emoji);
      if (removed) {
        await ctx.reply(`✅ <b>${emoji}</b> mapping ဖျက်ပြီးပါပြီ`, { parse_mode: "HTML" });
      } else {
        await ctx.reply(`⚠️ <b>${emoji}</b> mapping မတွေ့ပါ`, { parse_mode: "HTML" });
      }
      return;
    }

    // ── import ──
    if (lower === "import") {
      const dataPath = "/home/ubuntu/Pizza/artifacts/data/bot-data.json";
      try {
        const fs = await import("fs/promises");
        const data = JSON.parse(await fs.readFile(dataPath, "utf-8"));
        const importMap = data?.settings?.premiumEmojiMap || data?.settings?.emojiMap;
        
        if (importMap && typeof importMap === "object") {
          let count = 0;
          for (const [emoji, id] of Object.entries(importMap)) {
            await setPremiumEmoji(emoji, id as string);
            count++;
          }
          await ctx.reply(`✅ Emoji mapping ${count} ခုကို bot-data.json မှ import လုပ်ပြီးပါပြီ ✨`, { parse_mode: "HTML" });
        } else {
          await ctx.reply("⚠️ bot-data.json ထဲတွင် mapping မတွေ့ပါ။", { parse_mode: "HTML" });
        }
      } catch (err) {
        logger.error({ err }, "Failed to import premium emojis");
        await ctx.reply("❌ Import လုပ်ရာတွင် အမှားအယွင်းရှိပါသည်။ (File မတွေ့ပါ သို့မဟုတ် format မမှန်ပါ)", { parse_mode: "HTML" });
      }
      return;
    }

    // ── list ──
    if (arg.length === 0) {
      const map = getPremiumEmojiMap();
      const helpText =
        `\n\n━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📌 <b>Commands:</b>\n` +
        `<code>/premium</code>\n→ အသစ်ထည့်ရန် စတင်မည်\n\n` +
        `<code>/premium import</code>\n→ bot-data.json မှ mapping များ import လုပ်မည်\n\n` +
        `<code>/premium remove 👛</code>\n→ emoji တစ်ခု ဖျက်\n\n` +
        `<code>/premium clear</code>\n→ mapping အကုန် ဖျက်\n\n` +
        `💡 Custom emoji ID ရယူရန်:\nBot ဆီ animated emoji တစ်ခု ပို့ပါ → ID အလိုအလျောက် ပြပေးမည်`;

      if (map.size === 0) {
        await ctx.reply(`⭐ <b>Premium Emoji Manager</b>\n\nMapping မရှိသေးပါ` + helpText, { parse_mode: "HTML" });
      } else {
        let listText = `⭐ <b>Premium Emoji Manager</b>\n\n`;
        for (const [emoji, id] of map.entries()) {
          listText += `${emoji} → <code>${id}</code>\n`;
        }
        listText += helpText;
        await ctx.reply(listText, { parse_mode: "HTML" });
      }

      // Start the interactive flow
      ctx.session.premium_emoji_step = "waiting_original_emoji";
      await ctx.reply("✨ <b>Premium Emoji အသစ်ထည့်ရန်</b>\n\nပြောင်းလဲချင်တဲ့ <b>မူရင်း Emoji</b> ကို ပို့ပေးပါ (ဥပမာ: 🛒)");
      return;
    }

    // ── direct add (legacy support) ──
    const parts = arg.split(/\s+/);
    if (parts.length >= 2) {
      const emoji = parts[0];
      const id = parts[1];
      if (/^\d+$/.test(id)) {
        try {
          await setPremiumEmoji(emoji, id);
          await ctx.reply(`✅ <b>${emoji}</b> mapping ထည့်ပြီးပါပြီ!`, { parse_mode: "HTML" });
        } catch (err) {
          logger.error({ err }, "Failed to direct set premium emoji");
          await ctx.reply("❌ အမှားအယွင်းရှိပါသည်။");
        }
        return;
      }
    }
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
      const rawCap = svc.caption || escHtml(svc.name);
      // If it already contains HTML tags, use it as is.
      // Otherwise, escape it (though messageToHtml already escapes).
      const captionHtml = (rawCap.includes("<") && rawCap.includes(">")) ? rawCap : escHtml(rawCap);
      
      try {
        if (svc.photo) {
          try {
            await ctx.editMessageMedia({
              type: "photo",
              media: svc.photo,
              caption: captionHtml,
              parse_mode: "HTML",
            }, {
              reply_markup: servicePageKeyboard(svc),
            });
          } catch (mediaErr) {
            logger.warn({ mediaErr, svcId: svc.id }, "[svc] Failed to edit media, falling back to text-only edit");
            await ctx.editMessageText(captionHtml, {
              parse_mode: "HTML",
              reply_markup: servicePageKeyboard(svc),
            });
          }
        } else {
          await ctx.editMessageText(captionHtml, {
            parse_mode: "HTML",
            reply_markup: servicePageKeyboard(svc),
          });
        }
      } catch (err) {
        // If edit fails (e.g. message doesn't have media but we try to edit media), fallback to delete and reply
        try { await ctx.deleteMessage(); } catch {}
        if (svc.photo) {
          try {
            await ctx.replyWithPhoto(svc.photo, {
              caption: captionHtml,
              parse_mode: "HTML",
              reply_markup: servicePageKeyboard(svc),
            });
          } catch (photoErr) {
            logger.warn({ photoErr, svcId: svc.id }, "[svc] Failed to reply with photo, falling back to text");
            await ctx.reply(captionHtml, {
              parse_mode: "HTML",
              reply_markup: servicePageKeyboard(svc),
            });
          }
        } else {
          await ctx.reply(captionHtml, {
            parse_mode: "HTML",
            reply_markup: servicePageKeyboard(svc),
          });
        }
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
    const text = `🛒 <b>${bs("Service Menu")}</b>\n\nဝယ်ယူလိုသော ${bs("service")} ကိုနှိပ်ပါ ⬇️`;
    const kb = mainMenuKeyboard(services);
    
    try {
      // Try editing text first
      await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
    } catch (err) {
      // If editing text fails (likely because it's a photo message), try deleting and replying
      try { await ctx.deleteMessage(); } catch {}
      await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
    }
  });

  // ─── Callback: MG Service Button ───────────────────────────
  bot.callbackQuery("mg:service", async (ctx) => {
    await ctx.answerCallbackQuery({
      text: `🍕 MG Pizza Services`,
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

    const kpayInfo = `👾<b>Kpay - 09771351671 [PKKA]</b>\n\n👻<b>Wave - 09697328391 [ZKK]</b>`;
    const orderHeader =
      `📦 ${bs("Service")}: <b>${escHtml(svc.name)}</b>\n` +
      `🎯 ${bs("Package")}: ${escHtml(item.label)}\n` +
      `💰 ငွေပမာဏ: <b>${item.price.toLocaleString()} ks</b>\n\n`;

    let buyText = "";
    let buyKb: any = undefined;

    if (targetType === "uc") {
      ctx.session.step = "v2_waiting_player_id";
      buyText = orderHeader + `📋 <b>${bs("Game ID")}</b> ရိုက်ထည့်ပါ:\n<i>ဥပမာ: 5123456789</i>`;
    } else if (targetType === "dia") {
      ctx.session.step = "v2_waiting_player_id";
      buyText = orderHeader + `📋 <b>${bs("Game ID")}</b> ရိုက်ထည့်ပါ:`;
    } else if (svc.id === "tg_boost") {
      ctx.session.step = "waiting_tg_boost_step1";
      buyText = orderHeader + `📋 ဝယ်ယူလိုသော ${bs("Service")} နှင့် လင့်တွဲပို့ပေးပါ\n\n<i>ဥပမာ: Myanmar Sub 1k - boost ပေးရမဲ့လင့် တွဲပို့ပေးပါ အာ့အဆင့်ပီးမှ</i>`;
    } else if (svc.id === "tiktok") {
      ctx.session.step = "waiting_target";
      buyText = orderHeader + `🎵 ${bs("TikTok Post/Profile Link")} ပေးပို့ပါ`;
    } else if (svc.id === "tg_star") {
      ctx.session.step = "waiting_target";
      buyText = orderHeader + `⭐ ${bs("Telegram username")} ပေးပို့ပါ\n<code>(ဥပမာ: @myusername)</code>`;
    } else if (item.requireContact) {
      ctx.session.step = undefined;
      ctx.session.pendingOrderId = undefined;
      buyText = `📞 <b>${escHtml(item.label)}</b>\n\nဤ service အတွက် owner ထံ တိုက်ရိုက်ဆက်သွယ်ပေးပါ`;
      buyKb = contactOwnerKeyboard();
    } else if (targetType === "general") {
      ctx.session.step = "waiting_target";
      buyText = orderHeader + `📋 ဝယ်ယူလိုသော Service နှင့် လင့်တွဲပို့ပေးပါ`;
    } else if (svc.id === "tg_boost") {
      ctx.session.step = "waiting_target";
      buyText = orderHeader + `📋 ဝယ်ယူလိုသော Service နှင့် လင့်တွဲပို့ပေးပါ`;
    } else {
      ctx.session.step = "waiting_receipt";
      buyText = formatOrderSummary({
        orderId,
        serviceName: svc.name,
        itemLabel: item.label,
        price: item.price,
        unit: item.unit,
      }) + `\n\n${kpayInfo}\n\n📸 ငွေလွှဲပြေစာ ဓာတ်ပုံ (သို့မဟုတ်) ငွေလွှဲ ${bs("screenshot")} ကို ဤနေရာတွင် ပို့ပေးပါ`;
    }

    try {
      await ctx.editMessageText(buyText, { parse_mode: "HTML", reply_markup: buyKb });
    } catch (err) {
      try { await ctx.deleteMessage(); } catch {}
      await ctx.reply(buyText, { parse_mode: "HTML", reply_markup: buyKb });
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

    const kpayInfo = `👾<b>Kpay - 09771351671 [PKKA]</b>\n\n👻<b>Wave - 09697328391 [ZKK]</b>`;
    const targetType = svc.targetType || "general";

    let buySvcText = "";
    if (targetType === "uc" || targetType === "dia") {
      ctx.session.step = "v2_waiting_amount";
      buySvcText = `${targetType === "uc" ? "🎮" : "💎"} <b>${escHtml(svc.name)}</b>\n\n` +
        `💰 ဝယ်ယူမည့် <b>${bs("Amount")}</b> ကို ရိုက်ထည့်ပါ:`;
    } else {
      ctx.session.step = "waiting_target";
      buySvcText = `📦 <b>${escHtml(svc.name)}</b>\n\n` +
        kpayInfo + `\n\n` +
        `📋 ဝယ်ယူလိုသော Service နှင့် လင့်တွဲပို့ပေးပါ`;
    }

    try {
      await ctx.editMessageText(buySvcText, { parse_mode: "HTML" });
    } catch (err) {
      try { await ctx.deleteMessage(); } catch {}
      await ctx.reply(buySvcText, { parse_mode: "HTML" });
    }
  });

  // ─── Custom Emoji ID Detector (Owner only) ─────────────────
  // Owner က animated custom emoji ပို့ရင် ID ကို auto-extract ပြပေးမည်
  bot.on("message:entities:custom_emoji", async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) return;
    const entities = ctx.message.entities ?? [];
    const seen = new Set<string>();
    const found: Array<{ emoji: string; id: string }> = [];

    const msgText = ctx.message.text || ctx.message.caption || "";
    for (const ent of entities) {
      if (ent.type === "custom_emoji" && ent.custom_emoji_id) {
        const id = ent.custom_emoji_id;
        if (seen.has(id)) continue;
        seen.add(id);
        const emoji = [...msgText].slice(ent.offset, ent.offset + ent.length).join("");
        found.push({ emoji, id });
      }
    }

    if (found.length === 0) return;

    let reply = `🎯 <b>Custom Emoji IDs တွေ့ပါပြီ!</b>\n\n`;
    for (const { emoji, id } of found) {
      reply += `${emoji} → <code>${id}</code>\n`;
      reply += `/premium ${emoji} ${id}\n\n`;
    }
    reply += `⬆️ Command ကို tap/copy လုပ်ပြီး ပေးပို့ပါ`;
    await ctx.reply(reply, { parse_mode: "HTML" });
  });

  // ─── Message Handler ───────────────────────────────────────
  bot.on(["message:text", "message:photo"], async (ctx) => {
    const ownerChatId = Number(OWNER_CHAT_ID);
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";

    // If in group, ignore all messages to avoid bot chatting in groups.
    if (isGroup) {
      return;
    }

    // ── Premium Emoji flow ──
    if (isOwner(ctx, OWNER_CHAT_ID) && ctx.session.premium_emoji_step) {
      const text = ctx.message && "text" in ctx.message ? ctx.message.text?.trim() : "";
      
      if (ctx.session.premium_emoji_step === "waiting_original_emoji") {
        if (!text) return;
        ctx.session.premium_original_emoji = text;
        ctx.session.premium_emoji_step = "waiting_premium_emoji";
        await ctx.reply(
          `✅ မူရင်း emoji: ${text}\n\n` +
          `✨ ယခု <b>Premium Emoji</b> (Animated Emoji) ကို ပို့ပေးပါ`
        );
        return;
      }

      if (ctx.session.premium_emoji_step === "waiting_premium_emoji") {
        const entities = ctx.message?.entities ?? [];
        let foundId: string | undefined;
        
        for (const ent of entities) {
          if (ent.type === "custom_emoji" && ent.custom_emoji_id) {
            foundId = ent.custom_emoji_id;
            break;
          }
        }

        if (foundId) {
          const original = ctx.session.premium_original_emoji!;
          try {
            await setPremiumEmoji(original, foundId);
            await ctx.reply(
              `✅ <b>အောင်မြင်ပါသည်!</b>\n\n` +
              `${original} → <tg-emoji emoji-id="${foundId}">${original}</tg-emoji>\n\n` +
              `ယခုမှစ၍ Bot တစ်ခုလုံးရှိ ${original} အားလုံးကို Premium Emoji ဖြင့် ပြောင်းလဲပြသမည်ဖြစ်သည် ✨`,
              { parse_mode: "HTML" }
            );
          } catch (err) {
            logger.error({ err }, "Failed to set premium emoji");
            await ctx.reply("❌ သိမ်းဆည်းရာတွင် အမှားအယွင်းရှိပါသည်။");
          }
          ctx.session.premium_emoji_step = undefined;
          ctx.session.premium_original_emoji = undefined;
        } else {
          await ctx.reply("❌ Premium Emoji (Animated) ဖြစ်ရပါမည်။ ကျေးဇူးပြု၍ ပြန်ပို့ပေးပါ");
        }
        return;
      }
    }

    // ── Admin text input flow ──
    if (isOwner(ctx, OWNER_CHAT_ID) && ctx.session.adminStep) {
      await handleAdminInput(ctx);
      return;
    }

    // ── Welcome Media flow ──
    if (isOwner(ctx, OWNER_CHAT_ID) && ctx.session.welcome_media_step) {
      if (ctx.session.welcome_media_step === "waiting_photo") {
        if (ctx.message && "photo" in ctx.message && ctx.message.photo) {
          const photos = ctx.message.photo;
          const fileId = photos[photos.length - 1].file_id;
          await setWelcomeMedia({ photo: fileId });
          ctx.session.welcome_media_step = "waiting_caption";
          await ctx.reply(
            `✅ Photo သိမ်းပြီးပါပြီ!\n\n` +
            `📝 <b>Welcome Caption</b> ရိုက်ပါ (HTML OK)\n<i>သို့မဟုတ် ကျော်ပါ</i>`,
            { parse_mode: "HTML", reply_markup: adminSkipCaptionKeyboard() }
          );
        } else {
          await ctx.reply("❌ ဓာတ်ပုံ ပေးပို့ပါ သို့မဟုတ် ကျော်ပါ");
        }
        return;
      }

      if (ctx.session.welcome_media_step === "waiting_caption") {
        const msg = ctx.message;
        const text = msg && "text" in msg ? msg.text : "";
        const entities = msg && "entities" in msg ? msg.entities : [];
        
        if (text) {
          const htmlCaption = messageToHtml(text, entities);
          await setWelcomeMedia({ caption: htmlCaption });
          ctx.session.welcome_media_step = undefined;
          await ctx.reply(`✅ Welcome Media အားလုံး ပြင်ဆင်ပြီးပါပြီ ✨`, { reply_markup: adminMenuKeyboard() });
        } else {
          await ctx.reply("❌ စာသား ရိုက်ပါ သို့မဟုတ် ကျော်ပါ");
        }
        return;
      }
    }

    // ── User flow: v2 — waiting Amount (UC or Diamonds) ──
    if (ctx.session.step === "v2_waiting_amount" && ctx.session.pendingOrderId) {
      const text = ctx.message && "text" in ctx.message ? ctx.message.text?.trim() : "";
      if (!text) return;

      const order = await getOrder(ctx.session.pendingOrderId);
      const svc = (await getServices()).find((s) => s.id === order?.serviceId);
      const targetType = svc?.targetType || (svc?.id === "dia" ? "dia" : "uc");

      // ── Org Price lookup ──
      const normalizedAmt = text.replace(/[,\s]/g, "");
      const orgPrice = svc?.orgPrices?.[normalizedAmt];
      const updates: any = { quantity: text };
      
      if (orgPrice !== undefined) {
        updates.itemPrice = orgPrice;
        await updateOrder(ctx.session.pendingOrderId, updates);
        ctx.session.step = "v2_waiting_player_id";
        
        const packageLabel = text;
        await updateOrder(ctx.session.pendingOrderId, { itemLabel: packageLabel });

        await ctx.reply(
          `✅ Package: <b>${escHtml(text)}</b>\n💰 ကျသင့်ငွေ: <b>${orgPrice.toLocaleString()} ks</b>\n\n` +
          `📋 <b>${bs("Game ID")}</b> ရိုက်ထည့်ပါ:`,
          { parse_mode: "HTML" }
        );
      } else {
        // Always ask for price if not in orgPrices
        await updateOrder(ctx.session.pendingOrderId, updates);
        ctx.session.step = "v2_waiting_custom_price";
        await ctx.reply(
          `✅ Package: <b>${escHtml(text)}</b>\n\n` +
          `💰 ကျသင့်ငွေပမာဏ ရိုက်ပို့ပေးပါ:`,
          { parse_mode: "HTML" }
        );
      }
      return;
    }

    // ── User flow: v2 — waiting Custom Price (UC) ──
    if (ctx.session.step === "v2_waiting_custom_price" && ctx.session.pendingOrderId) {
      const text = ctx.message && "text" in ctx.message ? ctx.message.text?.trim() : "";
      if (!text) return;
      const price = parseInt(text.replace(/,/g, ""));
      if (isNaN(price)) {
        await ctx.reply("❌ ကျေးဇူးပြု၍ ကျသင့်ငွေ (နံပါတ်) ကိုသာ ရိုက်ပို့ပေးပါ");
        return;
      }

      await updateOrder(ctx.session.pendingOrderId, { itemPrice: price });
      ctx.session.step = "v2_waiting_player_id";
      await ctx.reply(
        `💰 ကျသင့်ငွေ: <b>${price.toLocaleString()} ks</b>\n\n` +
        `📋 <b>${bs("Game ID")}</b> ရိုက်ထည့်ပါ:`,
        { parse_mode: "HTML" }
      );
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
        // Diamonds — ask for server ID next
        ctx.session.collectedPlayerId = text;
        ctx.session.step = "v2_waiting_server_id";
        await ctx.reply(
          `✅ ${bs("Game ID")}: <code>${escHtml(text)}</code>\n\n` +
          `📋 <b>${bs("Server ID")}</b> ရိုက်ထည့်ပါ:\n<i>ဥပမာ: 1234</i>`,
          { parse_mode: "HTML" }
        );
      } else {
        // UC — Game ID is enough, go straight to receipt
        await updateOrder(ctx.session.pendingOrderId, { targetInfo: `${text}` });
        ctx.session.step = "waiting_receipt";
        const kpayInfo = `👾<b>Kpay - 09771351671 [PKKA]</b>\n\n👻<b>Wave - 09697328391 [ZKK]</b>`;
        await ctx.reply(
          `✅ ${bs("Game ID")}: <code>${escHtml(text)}</code>\n\n` +
          kpayInfo + `\n\n` +
          `📸 <b>${bs("KPay/Wave")} ပြေစာ ဓာတ်ပုံ</b> ပို့ပေးပါ`,
          { parse_mode: "HTML" }
        );
      }
      return;
    }

    // ── User flow: v2 — waiting Server ID (Diamonds or UC) ──
    if (ctx.session.step === "v2_waiting_server_id" && ctx.session.pendingOrderId) {
      const text = ctx.message && "text" in ctx.message ? ctx.message.text?.trim() : "";
      if (!text) return;
      const playerId = ctx.session.collectedPlayerId || "?";
      await updateOrder(ctx.session.pendingOrderId, {
        targetInfo: `${playerId} (${text})`,
      });
      ctx.session.step = "waiting_receipt";
      ctx.session.collectedPlayerId = undefined;
      const kpayInfo = `👾<b>Kpay - 09771351671 [PKKA]</b>\n\n👻<b>Wave - 09697328391 [ZKK]</b>`;
      await ctx.reply(
        `✅ <b>${bs("Game ID")}:</b> <code>${escHtml(playerId)} (${escHtml(text)})</code>\n\n` +
        kpayInfo + `\n\n` +
        `📸 <b>${bs("KPay/Wave")} ပြေစာ ဓာတ်ပုံ</b> ပို့ပေးပါ`,
        { parse_mode: "HTML" }
      );
      return;
    }

    // ── User flow: Telegram Boost Step 1 (Service & Link) ──
    if (ctx.session.step === "waiting_tg_boost_step1" && ctx.session.pendingOrderId) {
      const serviceLink = ctx.message && "text" in ctx.message ? ctx.message.text : "";
      if (!serviceLink) return;

      await updateOrder(ctx.session.pendingOrderId, { targetInfo: serviceLink });
      ctx.session.step = "waiting_tg_boost_step2";

      const order = await getOrder(ctx.session.pendingOrderId);
      if (!order) return;

      // Create the template message for step 2
      const step2Message = 
        `📦 <b>𝗦𝗲𝗿𝘃𝗶𝗰𝗲</b>: <b>${escHtml(order.serviceName)}</b>\n` +
        `🎯 <b>𝗣𝗮𝗰𝗸𝗮𝗴𝗲</b>: ${escHtml(order.itemLabel)}\n\n` +
        `📋 ဝယ်ယူလိုသော Service နှင့် လင့်တွဲပို့ပေးပါ\n\n` +
        `<i>ဥပမာ: Myanmar Sub 1k - boost ပေးရမဲ့လင့် တွဲပို့ပေးပါ အာ့အဆင့်ပီးမှ</i>`;

      await ctx.reply(step2Message, { parse_mode: "HTML" });
      return;
    }

    // ── User flow: Telegram Boost Step 2 (Service Details) ──
    if (ctx.session.step === "waiting_tg_boost_step2" && ctx.session.pendingOrderId) {
      const serviceDetails = ctx.message && "text" in ctx.message ? ctx.message.text : "";
      if (!serviceDetails) return;

      await updateOrder(ctx.session.pendingOrderId, { quantity: serviceDetails });
      ctx.session.step = "waiting_tg_boost_receipt";

      const order = await getOrder(ctx.session.pendingOrderId);
      if (!order) return;

      // Create the payment request message with proper formatting
      const paymentMessage = 
        `📦 <b>𝗦𝗲𝗿𝘃𝗶𝗰𝗲</b>: <b>${escHtml(order.serviceName)}</b>\n` +
        `🎯 <b>𝗣𝗮𝗰𝗸𝗮𝗴𝗲</b>: ${escHtml(order.itemLabel)}\n` +
        `💰 <b>ငွေပမာဏ</b>: <b>${order.itemPrice.toLocaleString()} ks</b>\n\n` +
        `👾<b>Kpay - 09771351671 [PKKA]</b>\n\n` +
        `👻<b>Wave - 09697328391 [ZKK]</b>\n\n` +
        `📸 <b>𝗞𝗣𝗮𝘆/𝗪𝗮𝘃𝗲 ပြေစာ ဓာတ်ပုံ</b> ပို့ပေးပါ`;

      await ctx.reply(paymentMessage, { parse_mode: "HTML" });
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

      // If it's a general service, we show targetInfo as the package label
      const services = await getServices();
      const svc = services.find(s => s.id === order.serviceId);
      const isGeneral = !svc?.targetType || svc.targetType === "general";
      
      const kpayInfo = `👾<b>Kpay - 09771351671 [PKKA]</b>\n\n👻<b>Wave - 09697328391 [ZKK]</b>`;
      const orderHeader = 
        `📦 ${bs("Service")}: <b>${escHtml(order.serviceName)}</b>\n` +
        `🎯 ${bs("Package")}: ${escHtml(isGeneral ? targetInfo : order.itemLabel)}\n` +
        `💰 ငွေပမာဏ: <b>${order.itemPrice.toLocaleString()} ks</b>\n\n`;

      await ctx.reply(
        orderHeader +
          kpayInfo + `\n\n` +
          `📸 <b>${bs("KPay/Wave")} ပြေစာ ဓာတ်ပုံ</b> ပို့ပေးပါ`,
        { parse_mode: "HTML" }
      );
      return;
    }

    // ── User flow: Telegram Boost Receipt ──
    if (ctx.session.step === "waiting_tg_boost_receipt" && ctx.session.pendingOrderId) {
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

      const services = await getServices();
      const svc = services.find(s => s.id === order.serviceId);
      const isGeneral = !svc?.targetType || svc.targetType === "general";

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

      const services = await getServices();
      const svc = services.find(s => s.id === order.serviceId);
      const isGeneral = !svc?.targetType || svc.targetType === "general";

      const doneCaption =
        `✨ <b>${bs("Order Completed!")}</b>\n\n` +
        `🆔 ${bs("Order ID")}: <code>${escHtml(order.orderId)}</code>\n` +
        `📦 ${bs("Service")}: ${escHtml(order.serviceName)}\n` +
        `🎯 ${bs("Package")}: ${escHtml(isGeneral ? (order.targetInfo || order.itemLabel) : order.itemLabel)}\n`;

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

    // Default: show menu (only in private chats)
    if (ctx.chat.type === "private" && !isOwner(ctx, OWNER_CHAT_ID)) {
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
          `❌ ငွေလက်ခံ မရရှိပါ`,
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
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: adminMenuKeyboard() });
  });

  // ─── Admin: Add Service ────────────────────────────────────
  bot.callbackQuery("admin:add", async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    await ctx.answerCallbackQuery();
    ctx.session.adminStep = "waiting_svc_name";
    ctx.session.newService = { items: [] };
    await ctx.editMessageText(`➕ <b>Service အသစ်ထည့်မည်</b>\n\n${bs("Service Name")} ရိုက်ထည့်ပါ:`, { parse_mode: "HTML" });
  });

  // ─── Admin: Manage Welcome Media ───────────────────────────
  bot.callbackQuery("admin:welcome_media", async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    await ctx.answerCallbackQuery();
    ctx.session.welcome_media_step = "waiting_photo";
    await ctx.editMessageText(
      `🖼️ <b>Welcome Photo/Caption ပြင်မည်</b>\n\n` +
      `📸 <b>Welcome Photo</b> ပို့ပေးပါ:\n<i>သို့မဟုတ် ကျော်ပါ</i>`,
      { parse_mode: "HTML", reply_markup: adminSkipPhotoKeyboard() }
    );
  });

  bot.callbackQuery("admin:skip_photo", async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    await ctx.answerCallbackQuery();
    ctx.session.welcome_media_step = "waiting_caption";
    await ctx.editMessageText(
      `📝 <b>Welcome Caption</b> ရိုက်ပါ (HTML OK):\n<i>သို့မဟုတ် ကျော်ပါ</i>`,
      { parse_mode: "HTML", reply_markup: adminSkipCaptionKeyboard() }
    );
  });

  bot.callbackQuery("admin:skip_caption", async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    await ctx.answerCallbackQuery();
    ctx.session.welcome_media_step = undefined;
    await ctx.editMessageText(`✅ Welcome Media ပြင်ဆင်မှု ပြီးပါပြီ ✨`, { reply_markup: adminMenuKeyboard() });
  });

  // ─── Admin: Services Manage ────────────────────────────────
  bot.callbackQuery("admin:svcs", async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    await ctx.answerCallbackQuery();
    const services = await getServices();
    await ctx.editMessageText(`⚙️ <b>Service စီမံခန့်ခွဲရန်</b>\n\nပြင်လိုသော ${bs("service")} ကို ရွေးပါ:`, {
      parse_mode: "HTML",
      reply_markup: adminServicesKeyboard(services),
    });
  });

  bot.callbackQuery(/^admin:svc:(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    const svcId = ctx.match[1];
    const services = await getServices();
    const svc = services.find((s) => s.id === svcId);
    if (!svc) { await ctx.answerCallbackQuery("မတွေ့ပါ"); return; }
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`📦 <b>Service: ${escHtml(svc.name)}</b>\n\nစီမံလိုသည့် အပိုင်းကို ရွေးပါ:`, {
      parse_mode: "HTML",
      reply_markup: adminServiceManageKeyboard(svc),
    });
  });

  bot.callbackQuery(/^admin:name:(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    ctx.session.editServiceId = ctx.match[1];
    ctx.session.adminStep = "edit_svc_name";
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`✏️ <b>Service Name ပြင်မည်</b>\n\nနာမည်အသစ် ရိုက်ထည့်ပါ:`, { parse_mode: "HTML" });
  });

  bot.callbackQuery(/^admin:svc_media:(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    ctx.session.editServiceId = ctx.match[1];
    ctx.session.adminStep = "edit_svc_photo";
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `📸 <b>Photo + Caption ထည့်/ပြင်မည်</b>\n\n` +
      `၁။ <b>Photo</b> ပို့ပေးပါ\n၂။ <b>Caption</b> ကို Photo နဲ့အတူ ပို့ပါ (သို့မဟုတ် သီးသန့်ပို့ပါ)`,
      { parse_mode: "HTML" }
    );
  });

  bot.callbackQuery(/^admin:svc_target:(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    const svcId = ctx.match[1];
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`🎯 <b>Target Type ပြင်မည်</b>\n\nအမျိုးအစား ရွေးချယ်ပါ:`, {
      parse_mode: "HTML",
      reply_markup: adminTargetTypeKeyboard(svcId),
    });
  });

  bot.callbackQuery(/^admin:target:(.+):(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    const svcId = ctx.match[1];
    const targetType = ctx.match[2];
    await updateService(svcId, { targetType });
    await ctx.answerCallbackQuery(`✅ Target Type ပြောင်းပြီးပါပြီ`);
    const services = await getServices();
    const svc = services.find((s) => s.id === svcId);
    await ctx.editMessageText(`📦 <b>Service: ${escHtml(svc!.name)}</b>\n\nစီမံလိုသည့် အပိုင်းကို ရွေးပါ:`, {
      parse_mode: "HTML",
      reply_markup: adminServiceManageKeyboard(svc!),
    });
  });

  bot.callbackQuery(/^admin:items:(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    const svcId = ctx.match[1];
    const services = await getServices();
    const svc = services.find((s) => s.id === svcId);
    if (!svc) return;
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`📦 <b>Items: ${escHtml(svc.name)}</b>\n\nပြင်လိုသော ${bs("item")} ကို ရွေးပါ:`, {
      parse_mode: "HTML",
      reply_markup: adminServiceItemsKeyboard(svc),
    });
  });

  bot.callbackQuery(/^admin:item:(.+):(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    const svcId = ctx.match[1];
    const itemId = ctx.match[2];
    ctx.session.editServiceId = svcId;
    ctx.session.editItemId = itemId;
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`📦 <b>Item စီမံမည်</b>\n\nဘာလုပ်ချင်ပါသလဲ:`, {
      parse_mode: "HTML",
      reply_markup: adminItemManageKeyboard(svcId, itemId),
    });
  });

  bot.callbackQuery(/^admin:ilabel:(.+):(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    ctx.session.editServiceId = ctx.match[1];
    ctx.session.editItemId = ctx.match[2];
    ctx.session.adminStep = "edit_item_label";
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`✏️ <b>Item Label ပြင်မည်</b>\n\nLabel အသစ် ရိုက်ထည့်ပါ:`, { parse_mode: "HTML" });
  });

  bot.callbackQuery(/^admin:iprice:(.+):(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    ctx.session.editServiceId = ctx.match[1];
    ctx.session.editItemId = ctx.match[2];
    ctx.session.adminStep = "edit_item_price";
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`💰 <b>Item Price ပြင်မည်</b>\n\nဈေးနှုန်းအသစ် (နံပါတ်) ရိုက်ထည့်ပါ:`, { parse_mode: "HTML" });
  });

  bot.callbackQuery(/^admin:idel:(.+):(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    const svcId = ctx.match[1];
    const itemId = ctx.match[2];
    const services = await getServices();
    const svc = services.find((s) => s.id === svcId);
    if (!svc) return;
    const items = svc.items.filter((i) => i.id !== itemId);
    await updateService(svcId, { items });
    await ctx.answerCallbackQuery(`🗑️ Item ဖျက်ပြီးပါပြီ`);
    const updatedSvc = (await getServices()).find((s) => s.id === svcId);
    await ctx.editMessageText(`📦 <b>Items: ${escHtml(svc.name)}</b>\n\nပြင်လိုသော ${bs("item")} ကို ရွေးပါ:`, {
      parse_mode: "HTML",
      reply_markup: adminServiceItemsKeyboard(updatedSvc!),
    });
  });

  bot.callbackQuery(/^admin:iadd:(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    ctx.session.editServiceId = ctx.match[1];
    ctx.session.adminStep = "edit_item_add_label";
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`➕ <b>Item အသစ်ထည့်မည်</b>\n\nItem Label ရိုက်ထည့်ပါ:`, { parse_mode: "HTML" });
  });

  bot.callbackQuery(/^admin:del:(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    const svcId = ctx.match[1];
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`⚠️ <b>Service ဖျက်မည်</b>\n\nသေချာပါသလား?`, {
      parse_mode: "HTML",
      reply_markup: adminConfirmDeleteKeyboard(svcId),
    });
  });

  bot.callbackQuery(/^admin:del_ok:(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    const svcId = ctx.match[1];
    await deleteService(svcId);
    await ctx.answerCallbackQuery(`🗑️ ဖျက်ပြီးပါပြီ`);
    const services = await getServices();
    await ctx.editMessageText(`⚙️ <b>Service စီမံခန့်ခွဲရန်</b>\n\nပြင်လိုသော ${bs("service")} ကို ရွေးပါ:`, {
      parse_mode: "HTML",
      reply_markup: adminServicesKeyboard(services),
    });
  });

  // ─── Admin: Org Price ──────────────────────────────────────
  bot.callbackQuery(/^admin:orgprice:(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    const svcId = ctx.match[1];
    const services = await getServices();
    const svc = services.find((s) => s.id === svcId);
    if (!svc) return;
    await ctx.answerCallbackQuery();
    let text = `💰 <b>Original Prices: ${escHtml(svc.name)}</b>\n\n`;
    if (svc.orgPrices && Object.keys(svc.orgPrices).length > 0) {
      for (const [amt, prc] of Object.entries(svc.orgPrices)) {
        text += `• ${amt} → ${prc.toLocaleString()} ks\n`;
      }
    } else {
      text += `သတ်မှတ်ထားသော price မရှိသေးပါ`;
    }
    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: adminOrgPriceKeyboard(svcId),
    });
  });

  bot.callbackQuery(/^admin:orgprice_add:(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    ctx.session.editServiceId = ctx.match[1];
    ctx.session.adminStep = "admin_orgprice_amt";
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`➕ <b>Org Price ထည့်မည်</b>\n\nဝယ်ယူမည့် <b>Amount</b> ကို ရိုက်ပါ:\n<i>ဥပမာ: 1000</i>`, { parse_mode: "HTML" });
  });

  bot.callbackQuery(/^admin:orgprice_clear:(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    const svcId = ctx.match[1];
    await clearOrgPrices(svcId);
    await ctx.answerCallbackQuery(`🗑️ Prices အကုန် ဖျက်ပြီးပါပြီ`);
    const services = await getServices();
    const svc = services.find((s) => s.id === svcId);
    await ctx.editMessageText(`💰 <b>Original Prices: ${escHtml(svc!.name)}</b>\n\nသတ်မှတ်ထားသော price မရှိသေးပါ`, {
      parse_mode: "HTML",
      reply_markup: adminOrgPriceKeyboard(svcId),
    });
  });

  // ─── Admin: Add flow categories ────────────────────────────
  bot.callbackQuery(/^admin:addcat:(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    const cat = ctx.match[1];
    ctx.session.newService!.targetType = cat;
    ctx.session.newService!.category = cat === "contact" ? "contact" : "main";
    await ctx.answerCallbackQuery();
    ctx.session.adminStep = "waiting_svc_item_label";
    await ctx.editMessageText(`📦 <b>Item ပထမဆုံးတစ်ခု ထည့်မည်</b>\n\nItem Label ရိုက်ထည့်ပါ:`, { parse_mode: "HTML" });
  });

  bot.callbackQuery("admin:add_done", async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    const svc = ctx.session.newService;
    if (!svc || !svc.name) return;
    await addService(svc as Service);
    await ctx.answerCallbackQuery(`✅ Service သိမ်းပြီးပါပြီ`);
    ctx.session.adminStep = undefined;
    ctx.session.newService = undefined;
    await ctx.editMessageText(`⚙️ <b>Admin Panel</b>\n\nService အသစ် သိမ်းဆည်းပြီးပါပြီ ✨`, {
      parse_mode: "HTML",
      reply_markup: adminMenuKeyboard(),
    });
  });

  return bot;
}

// ─── Admin Input Handler ────────────────────────────────────
async function handleAdminInput(ctx: MyContext) {
  const text = ctx.message && "text" in ctx.message ? ctx.message.text?.trim() : "";
  const step = ctx.session.adminStep;

  // Add flow
  if (step === "waiting_svc_name" && text) {
    ctx.session.newService!.name = text;
    ctx.session.newService!.id = text.toLowerCase().replace(/\s+/g, "_").replace(/[^\w]/g, "");
    ctx.session.adminStep = "waiting_svc_cat";
    await ctx.reply(`🎯 <b>Target Type</b> ရွေးချယ်ပါ:`, {
      parse_mode: "HTML",
      reply_markup: adminNewSvcTargetKeyboard(),
    });
    return;
  }

  if (step === "waiting_svc_item_label" && text) {
    ctx.session.newService!.items!.push({
      id: "i_" + Date.now(),
      label: text,
      price: 0,
      unit: "ks",
      requireContact: ctx.session.newService!.category === "contact",
    });
    if (ctx.session.newService!.category === "contact") {
      await ctx.reply(`✅ Item ထည့်ပြီးပါပြီ။ နောက်ထပ် ထည့်ဦးမလား?`, {
        parse_mode: "HTML",
        reply_markup: adminAddMoreItemsKeyboard(),
      });
      ctx.session.adminStep = "waiting_add_more";
    } else {
      ctx.session.adminStep = "waiting_svc_item_price";
      await ctx.reply(`💰 ဈေးနှုန်း (နံပါတ်) ရိုက်ထည့်ပါ:`);
    }
    return;
  }

  if (step === "waiting_svc_item_price" && text) {
    const price = parseInt(text.replace(/,/g, ""));
    if (isNaN(price)) { await ctx.reply("❌ နံပါတ်ပဲ ရိုက်ပါ"); return; }
    const items = ctx.session.newService!.items!;
    items[items.length - 1].price = price;
    await ctx.reply(`✅ Item ထည့်ပြီးပါပြီ။ နောက်ထပ် ထည့်ဦးမလား?`, {
      parse_mode: "HTML",
      reply_markup: adminAddMoreItemsKeyboard(),
    });
    ctx.session.adminStep = "waiting_add_more";
    return;
  }

  // Edit flow
  if (step === "edit_svc_name" && text) {
    await updateService(ctx.session.editServiceId!, { name: text });
    await ctx.reply(`✅ Service Name ပြင်ပြီးပါပြီ`);
    ctx.session.adminStep = undefined;
    const services = await getServices();
    const svc = services.find((s) => s.id === ctx.session.editServiceId);
    await ctx.reply(`📦 <b>Service: ${escHtml(svc!.name)}</b>`, {
      parse_mode: "HTML",
      reply_markup: adminServiceManageKeyboard(svc!),
    });
    return;
  }

  if (step === "edit_svc_photo") {
    let photo: string | undefined;
    let caption: string | undefined;

    if (ctx.message && "photo" in ctx.message && ctx.message.photo) {
      const photos = ctx.message.photo;
      photo = photos[photos.length - 1].file_id;
      if (ctx.message.caption) {
        caption = messageToHtml(ctx.message.caption, ctx.message.caption_entities);
      }
    } else if (ctx.message && "text" in ctx.message && ctx.message.text) {
      caption = messageToHtml(ctx.message.text, ctx.message.entities);
    }

    if (photo || caption) {
      const updates: any = {};
      if (photo) updates.photo = photo;
      if (caption) updates.caption = caption;
      await updateService(ctx.session.editServiceId!, updates);
      await ctx.reply(`✅ Photo/Caption ပြင်ပြီးပါပြီ`);
      ctx.session.adminStep = undefined;
      const services = await getServices();
      const svc = services.find((s) => s.id === ctx.session.editServiceId);
      await ctx.reply(`📦 <b>Service: ${escHtml(svc!.name)}</b>`, {
        parse_mode: "HTML",
        reply_markup: adminServiceManageKeyboard(svc!),
      });
    }
    return;
  }

  if (step === "edit_item_label" && text) {
    const svcId = ctx.session.editServiceId!;
    const itemId = ctx.session.editItemId!;
    const services = await getServices();
    const svc = services.find((s) => s.id === svcId);
    const items = svc!.items.map((i) => (i.id === itemId ? { ...i, label: text } : i));
    await updateService(svcId, { items });
    await ctx.reply(`✅ Item Label ပြင်ပြီးပါပြီ`);
    ctx.session.adminStep = undefined;
    await ctx.reply(`📦 <b>Item စီမံမည်</b>`, {
      parse_mode: "HTML",
      reply_markup: adminItemManageKeyboard(svcId, itemId),
    });
    return;
  }

  if (step === "edit_item_price" && text) {
    const price = parseInt(text.replace(/,/g, ""));
    if (isNaN(price)) { await ctx.reply("❌ နံပါတ်ပဲ ရိုက်ပါ"); return; }
    const svcId = ctx.session.editServiceId!;
    const itemId = ctx.session.editItemId!;
    const services = await getServices();
    const svc = services.find((s) => s.id === svcId);
    const items = svc!.items.map((i) => (i.id === itemId ? { ...i, price } : i));
    await updateService(svcId, { items });
    await ctx.reply(`✅ Item Price ပြင်ပြီးပါပြီ`);
    ctx.session.adminStep = undefined;
    await ctx.reply(`📦 <b>Item စီမံမည်</b>`, {
      parse_mode: "HTML",
      reply_markup: adminItemManageKeyboard(svcId, itemId),
    });
    return;
  }

  if (step === "edit_item_add_label" && text) {
    ctx.session.editField = text; // temporary store label
    ctx.session.adminStep = "edit_item_add_price";
    await ctx.reply(`💰 ဈေးနှုန်း (နံပါတ်) ရိုက်ထည့်ပါ:`);
    return;
  }

  if (step === "edit_item_add_price" && text) {
    const price = parseInt(text.replace(/,/g, ""));
    if (isNaN(price)) { await ctx.reply("❌ နံပါတ်ပဲ ရိုက်ပါ"); return; }
    const svcId = ctx.session.editServiceId!;
    const label = ctx.session.editField!;
    const services = await getServices();
    const svc = services.find((s) => s.id === svcId);
    const items = svc!.items;
    items.push({
      id: "i_" + Date.now(),
      label,
      price,
      unit: "ks",
      requireContact: svc!.category === "contact",
    });
    await updateService(svcId, { items });
    await ctx.reply(`✅ Item အသစ်ထည့်ပြီးပါပြီ`);
    ctx.session.adminStep = undefined;
    ctx.session.editField = undefined;
    const updatedSvc = (await getServices()).find((s) => s.id === svcId);
    await ctx.reply(`📦 <b>Items: ${escHtml(updatedSvc!.name)}</b>`, {
      parse_mode: "HTML",
      reply_markup: adminServiceItemsKeyboard(updatedSvc!),
    });
    return;
  }

  // Org Price Flow
  if (step === "admin_orgprice_amt" && text) {
    ctx.session.editField = text; // store amount
    ctx.session.adminStep = "admin_orgprice_prc";
    await ctx.reply(`💰 ကျသင့်ငွေ (နံပါတ်) ရိုက်ပါ:`);
    return;
  }

  if (step === "admin_orgprice_prc" && text) {
    const price = parseInt(text.replace(/,/g, ""));
    if (isNaN(price)) { await ctx.reply("❌ နံပါတ်ပဲ ရိုက်ပါ"); return; }
    const svcId = ctx.session.editServiceId!;
    const amt = ctx.session.editField!;
    await addOrgPrice(svcId, amt, price);
    await ctx.reply(`✅ Original Price ထည့်ပြီးပါပြီ`);
    ctx.session.adminStep = undefined;
    ctx.session.editField = undefined;
    const updatedSvc = (await getServices()).find((s) => s.id === svcId);
    await ctx.reply(`📦 <b>Service: ${escHtml(updatedSvc!.name)}</b>`, {
      parse_mode: "HTML",
      reply_markup: adminServiceManageKeyboard(updatedSvc!),
    });
    return;
  }
}
