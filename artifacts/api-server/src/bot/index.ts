import { Bot, Context, session, SessionFlavor, InlineKeyboard } from "grammy";
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
  mainMenuKeyboard,
  serviceItemsKeyboard,
  ownerOrderKeyboard,
  ownerDoneKeyboard,
  adminMenuKeyboard,
} from "./keyboards";
import {
  generateOrderId,
  formatOrderSummary,
  formatReceiptNotification,
  isOwner,
} from "./helpers";

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

if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN environment variable is required");
}

export function createBot() {
  const bot = new Bot<MyContext>(BOT_TOKEN!);

  bot.use(
    session({
      initial: (): SessionData => ({}),
    })
  );

  // ─── /start ───────────────────────────────────────────────
  bot.command("start", async (ctx) => {
    ctx.session = {};
    const services = await getServices();
    const name = ctx.from?.first_name || "Customer";
    await ctx.reply(
      `👋 မင်္ဂလာပါ *${name}* !\n\n` +
        `🛒 *MG Pizza Services* မှ ကြိုဆိုပါသည်\n\n` +
        `📌 ဝယ်ယူလိုသော Service တစ်ခုကို ရွေးချယ်ပါ ⬇️`,
      {
        parse_mode: "Markdown",
        reply_markup: mainMenuKeyboard(services),
      }
    );
  });

  // ─── /menu ────────────────────────────────────────────────
  bot.command("menu", async (ctx) => {
    ctx.session = {};
    const services = await getServices();
    await ctx.reply(
      `🛒 *Service Menu*\n\nဝယ်ယူလိုသော service ကိုနှိပ်ပါ ⬇️`,
      {
        parse_mode: "Markdown",
        reply_markup: mainMenuKeyboard(services),
      }
    );
  });

  // ─── /admin ───────────────────────────────────────────────
  bot.command("admin", async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) {
      await ctx.reply("❌ ခွင့်မပြုပါ");
      return;
    }
    await ctx.reply(
      `⚙️ *Admin Panel*\n\nService များ စီမံခန့်ခွဲရန်:`,
      {
        parse_mode: "Markdown",
        reply_markup: adminMenuKeyboard(),
      }
    );
  });

  // ─── Callback: Service Selection ──────────────────────────
  bot.callbackQuery(/^svc:(.+)$/, async (ctx) => {
    const serviceId = ctx.match[1];
    const services = await getServices();
    const svc = services.find((s) => s.id === serviceId);
    if (!svc) { await ctx.answerCallbackQuery("Service မတွေ့ပါ"); return; }
    await ctx.answerCallbackQuery();

    let text = `📦 *${svc.name}*\n\n`;
    if (svc.category === "contact") {
      text += `ဤ service များကို ဝယ်ယူရန် owner ထံ တိုက်ရိုက်ဆက်သွယ်ပေးပါ\n\n`;
    } else {
      text += `ဝယ်ယူလိုသော package ကို ရွေးချယ်ပါ 👇\n\n`;
      for (const item of svc.items) {
        text += `• ${item.label} — *${item.price.toLocaleString()} ${item.unit}*\n`;
      }
    }

    await ctx.editMessageText(text, {
      parse_mode: "Markdown",
      reply_markup: serviceItemsKeyboard(svc),
    });
  });

  // ─── Callback: Back to Main ────────────────────────────────
  bot.callbackQuery("back:main", async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session = {};
    const services = await getServices();
    await ctx.editMessageText(
      `🛒 *Service Menu*\n\nဝယ်ယူလိုသော service ကိုနှိပ်ပါ ⬇️`,
      {
        parse_mode: "Markdown",
        reply_markup: mainMenuKeyboard(services),
      }
    );
  });

  // ─── Callback: Contact (for "Others" services) ────────────
  bot.callbackQuery(/^contact:(.+):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `📞 *အခြား Services*\n\n` +
        `ဤ service ကို ဝယ်ယူရန်\n` +
        `👉 Owner ထံ တိုက်ရိုက်ဆက်သွယ်ပေးပါ\n\n` +
        `💬 Service အသေးစိတ် မေးမြန်းနိုင်ပါသည်`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().text("🔙 ပြန်သွား", "back:main"),
      }
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
      svc.id === "tg_boost" ||
      svc.id === "tiktok" ||
      svc.id === "tg_star";

    if (needsTarget) {
      let promptText = ``;
      if (svc.id === "tg_boost") {
        promptText = `📢 Channel/Group username ပေးပို့ပါ\n\`(ဥပမာ: @mychannel)\``;
      } else if (svc.id === "tiktok") {
        promptText = `🎵 TikTok Post/Profile Link ပေးပို့ပါ`;
      } else if (svc.id === "tg_star") {
        promptText = `⭐ Telegram username ပေးပို့ပါ\n\`(ဥပမာ: @myusername)\``;
      }

      await ctx.editMessageText(
        `✅ Package ရွေးချယ်ပြီးပါပြီ!\n\n` +
          `📦 Service: *${svc.name}*\n` +
          `🎯 Package: ${item.label}\n` +
          `💰 ငွေပမာဏ: *${item.price.toLocaleString()} ks*\n\n` +
          `${promptText}`,
        { parse_mode: "Markdown" }
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
          `\n\n💳 *KPay / Wave နံပါတ်:* \`${KPAY_NUMBER}\`\n\n` +
          `📸 ငွေလွှဲပြေစာ ဓာတ်ပုံ (သို့မဟုတ်) ငွေလွှဲ screenshot ကို ဤနေရာတွင် ပို့ပေးပါ`,
        { parse_mode: "Markdown" }
      );
    }
  });

  // ─── Text/Photo Message Handler ───────────────────────────
  bot.on(["message:text", "message:photo"], async (ctx) => {
    const userId = ctx.from?.id;
    const ownerChatId = Number(OWNER_CHAT_ID);

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
          `\n\n💳 *KPay / Wave နံပါတ်:* \`${KPAY_NUMBER}\`\n\n` +
          `📸 ငွေလွှဲပြေစာ ဓာတ်ပုံ (သို့မဟုတ်) screenshot ကို ဤနေရာတွင် ပို့ပေးပါ`,
        { parse_mode: "Markdown" }
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

      // Notify user: waiting for check
      const waitMsg = await ctx.reply(
        `⏳ ပြေစာ စစ်ဆေးနေပါသည်...\n\nခဏလေး စောင့်ပေးပါ 🙏`,
        { parse_mode: "Markdown" }
      );

      await updateOrder(order.orderId, { messageId: waitMsg.message_id });

      // Forward to owner
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

      let ownerMsg;
      if (receiptFileId) {
        ownerMsg = await ctx.api.sendPhoto(ownerChatId, receiptFileId, {
          caption: ownerNotifText,
          parse_mode: "Markdown",
          reply_markup: ownerOrderKeyboard(order.orderId),
        });
      } else {
        ownerMsg = await ctx.api.sendMessage(ownerChatId, ownerNotifText, {
          parse_mode: "Markdown",
          reply_markup: ownerOrderKeyboard(order.orderId),
        });
      }

      await updateOrder(order.orderId, { ownerMessageId: ownerMsg.message_id });
      ctx.session = {};
      return;
    }

    // ── Owner: done slip photo/text ──
    if (isOwner(ctx, OWNER_CHAT_ID) && ctx.session.step === "waiting_done_slip" && ctx.session.pendingOrderId) {
      const order = await getOrder(ctx.session.pendingOrderId);
      if (!order) return;

      // Send done slip to customer
      if (ctx.message && "photo" in ctx.message && ctx.message.photo) {
        const photos = ctx.message.photo;
        const fileId = photos[photos.length - 1].file_id;
        const cap = ctx.message.caption || "";
        await ctx.api.sendPhoto(order.userId, fileId, {
          caption:
            `✅ *Order Completed!*\n\n` +
            `🆔 Order ID: \`${order.orderId}\`\n` +
            `📦 Service: ${order.serviceName}\n` +
            `🎯 Package: ${order.itemLabel}\n\n` +
            (cap ? `📝 ${cap}\n\n` : "") +
            `ကျေးဇူးတင်ပါသည် 🙏 MG Pizza Services`,
          parse_mode: "Markdown",
        });
      } else if (ctx.message && "text" in ctx.message) {
        await ctx.api.sendMessage(
          order.userId,
          `✅ *Order Completed!*\n\n` +
            `🆔 Order ID: \`${order.orderId}\`\n` +
            `📦 Service: ${order.serviceName}\n` +
            `🎯 Package: ${order.itemLabel}\n\n` +
            `📝 ${ctx.message.text}\n\n` +
            `ကျေးဇူးတင်ပါသည် 🙏 MG Pizza Services`,
          { parse_mode: "Markdown" }
        );
      }

      await updateOrder(order.orderId, { status: "completed" });
      await ctx.reply(`✅ Done slip ကို customer ဆီ ပေးပို့ပြီးပါပြီ!`);
      ctx.session = {};
      return;
    }

    // Default: show menu
    if (!isOwner(ctx, OWNER_CHAT_ID)) {
      const services = await getServices();
      await ctx.reply(
        `🛒 *Service Menu*\n\nဝယ်ယူလိုသော service ကိုနှိပ်ပါ ⬇️`,
        {
          parse_mode: "Markdown",
          reply_markup: mainMenuKeyboard(services),
        }
      );
    }
  });

  // ─── Owner Confirm ─────────────────────────────────────────
  bot.callbackQuery(/^owner:confirm:(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌ ခွင့်မပြုပါ"); return; }
    const orderId = ctx.match[1];
    const order = await getOrder(orderId);
    if (!order) { await ctx.answerCallbackQuery("Order မတွေ့ပါ"); return; }
    await ctx.answerCallbackQuery("✅ Confirmed!");

    const isInstant = order.serviceId === "dia" || order.serviceId === "uc" || order.serviceId === "tg_star";

    if (order.messageId) {
      try {
        await ctx.api.deleteMessage(order.userId, order.messageId);
      } catch {}
    }

    if (isInstant) {
      await ctx.api.sendMessage(
        order.userId,
        `✅ *ငွေလက်ခံရရှိပါသည်*\n\n` +
          `🆔 Order ID: \`${orderId}\`\n` +
          `📦 ${order.serviceName} — ${order.itemLabel}\n\n` +
          `⚡ ထည့်သွင်းပြီးပါပြီ ✨\n\n` +
          `ကျေးဇူးတင်ပါသည် 🙏 MG Pizza Services`,
        { parse_mode: "Markdown" }
      );
      await updateOrder(orderId, { status: "completed" });
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      await ctx.reply(`✅ Order \`${orderId}\` — ငွေလက်ခံ + Done ပြီးပါပြီ`, { parse_mode: "Markdown" });
    } else {
      await ctx.api.sendMessage(
        order.userId,
        `✅ *ငွေလက်ခံရရှိပါသည်*\n\n` +
          `🆔 Order ID: \`${orderId}\`\n` +
          `📦 ${order.serviceName} — ${order.itemLabel}\n\n` +
          `⏳ Order တင်ပြီးပါပြီ၊ ခနလေး စောင့်ပေးပါ 🙏`,
        { parse_mode: "Markdown" }
      );
      await updateOrder(orderId, { status: "processing" });
      await ctx.editMessageReplyMarkup({
        reply_markup: ownerDoneKeyboard(orderId),
      });
    }
  });

  // ─── Owner Reject ──────────────────────────────────────────
  bot.callbackQuery(/^owner:reject:(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌ ခွင့်မပြုပါ"); return; }
    const orderId = ctx.match[1];
    const order = await getOrder(orderId);
    if (!order) { await ctx.answerCallbackQuery("Order မတွေ့ပါ"); return; }
    await ctx.answerCallbackQuery("❌ Rejected");

    if (order.messageId) {
      try {
        await ctx.api.deleteMessage(order.userId, order.messageId);
      } catch {}
    }

    await ctx.api.sendMessage(
      order.userId,
      `❌ *ငွေလွှဲပြေစာ လက်ခံမရရှိပါ*\n\n` +
        `🆔 Order ID: \`${orderId}\`\n\n` +
        `📸 ငွေလွှဲပြေစာကို ပြန်လည် စစ်ဆေး၍ ထပ်မံ ပေးပို့ပေးပါ`,
      { parse_mode: "Markdown" }
    );

    await updateOrder(orderId, { status: "rejected" });
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    await ctx.reply(`❌ Order \`${orderId}\` — ငွေလွှဲ မတည့်ပါ`, { parse_mode: "Markdown" });
  });

  // ─── Owner Done Slip ───────────────────────────────────────
  bot.callbackQuery(/^owner:done:(.+)$/, async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌ ခွင့်မပြုပါ"); return; }
    const orderId = ctx.match[1];
    await ctx.answerCallbackQuery();
    ctx.session.step = "waiting_done_slip";
    ctx.session.pendingOrderId = orderId;
    await ctx.reply(
      `📤 *Done Slip ပို့မည်*\n\n` +
        `Order ID: \`${orderId}\`\n\n` +
        `📸 Done slip ဓာတ်ပုံ (သို့မဟုတ်) Done အကြောင်းကြားချက် စာပို့ပေးပါ`,
      { parse_mode: "Markdown" }
    );
  });

  // ─── Admin Callbacks ───────────────────────────────────────
  bot.callbackQuery("admin:list", async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    await ctx.answerCallbackQuery();
    const services = await getServices();
    let text = `📋 *Service List*\n\n`;
    for (const svc of services) {
      text += `🔹 *${svc.name}* (ID: \`${svc.id}\`)\n`;
      for (const item of svc.items) {
        if (item.requireContact) {
          text += `  • ${item.label} — Contact\n`;
        } else {
          text += `  • ${item.label} — ${item.price.toLocaleString()} ks\n`;
        }
      }
      text += `\n`;
    }
    await ctx.reply(text, { parse_mode: "Markdown" });
  });

  bot.callbackQuery("admin:add", async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    await ctx.answerCallbackQuery();
    ctx.session.adminStep = "add_service_id";
    ctx.session.newService = {};
    await ctx.reply(
      `➕ *Service အသစ်ထည့်*\n\n` +
        `Service ID ရိုက်ထည့်ပါ (emoji မပါဘဲ, underscore သုံးပါ)\n` +
        `ဥပမာ: \`facebook_like\``,
      { parse_mode: "Markdown" }
    );
  });

  bot.callbackQuery("admin:edit", async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    await ctx.answerCallbackQuery();
    ctx.session.adminStep = "edit_choose_service";
    const services = await getServices();
    let text = `✏️ *ဘယ် Service ပြင်မလဲ?*\n\nService ID ရိုက်ပါ:\n\n`;
    for (const s of services) {
      text += `• \`${s.id}\` — ${s.name}\n`;
    }
    await ctx.reply(text, { parse_mode: "Markdown" });
  });

  bot.callbackQuery("admin:delete", async (ctx) => {
    if (!isOwner(ctx, OWNER_CHAT_ID)) { await ctx.answerCallbackQuery("❌"); return; }
    await ctx.answerCallbackQuery();
    ctx.session.adminStep = "delete_service";
    const services = await getServices();
    let text = `🗑️ *ဘယ် Service ဖျက်မလဲ?*\n\nService ID ရိုက်ပါ:\n\n`;
    for (const s of services) {
      text += `• \`${s.id}\` — ${s.name}\n`;
    }
    await ctx.reply(text, { parse_mode: "Markdown" });
  });

  // ─── Admin Input Handler ───────────────────────────────────
  async function handleAdminInput(ctx: MyContext, ownerChatId: number) {
    const text = ctx.message && "text" in ctx.message ? ctx.message.text?.trim() : "";
    if (!text) return;

    const step = ctx.session.adminStep;

    // Add service flow
    if (step === "add_service_id") {
      ctx.session.newService = { id: text, items: [] };
      ctx.session.adminStep = "add_service_name";
      await ctx.reply(`Service Name (emoji ထည့်လို့ရ) ရိုက်ပါ:\nဥပမာ: \`🎯 Facebook Likes\``, { parse_mode: "Markdown" });

    } else if (step === "add_service_name") {
      ctx.session.newService!.name = text;
      ctx.session.adminStep = "add_service_category";
      await ctx.reply(
        `Category ရွေးပါ:\n\n\`main\` — ငွေပေးပြီး order တင်\n\`contact\` — owner ဆီ တိုက်ရိုက်ဆက်သွယ်`,
        { parse_mode: "Markdown" }
      );

    } else if (step === "add_service_category") {
      ctx.session.newService!.category = text === "contact" ? "contact" : "main";
      ctx.session.adminStep = "add_service_items";
      await ctx.reply(
        `Items ထည့်ပါ (တစ်ကြောင်းချင်း):\n\nFormat: \`label|price\`\nဥပမာ: \`1,000 Likes|2000\`\n\nပြီးရင် "done" ရိုက်ပါ`,
        { parse_mode: "Markdown" }
      );

    } else if (step === "add_service_items") {
      if (text.toLowerCase() === "done") {
        const svc = ctx.session.newService as Service;
        if (!svc.items || svc.items.length === 0) {
          await ctx.reply("❌ Item အနည်းဆုံး ၁ ခုထည့်ပါ");
          return;
        }
        await addService(svc);
        ctx.session.adminStep = undefined;
        ctx.session.newService = undefined;
        await ctx.reply(`✅ *${svc.name}* Service ထည့်ပြီးပါပြီ!`, { parse_mode: "Markdown" });
      } else {
        const parts = text.split("|");
        if (parts.length < 2) {
          await ctx.reply("❌ Format မှား။ \`label|price\` ဖြင့်ပြန်ရိုက်ပါ", { parse_mode: "Markdown" });
          return;
        }
        const label = parts[0].trim();
        const price = parseInt(parts[1].trim().replace(/[^0-9]/g, ""), 10);
        const item: ServiceItem = {
          id: `${ctx.session.newService!.id}_${Date.now()}`,
          label,
          price,
          unit: "ks",
          requireContact: ctx.session.newService!.category === "contact",
        };
        ctx.session.newService!.items = [...(ctx.session.newService!.items || []), item];
        await ctx.reply(`✅ "${label}" ထည့်ပြီး။ ဆက်ထည့်နိုင်သည်၊ ပြီးရင် "done"`, { parse_mode: "Markdown" });
      }

    // Edit service
    } else if (step === "edit_choose_service") {
      const services = await getServices();
      const svc = services.find((s) => s.id === text);
      if (!svc) {
        await ctx.reply("❌ Service ID မတွေ့ပါ");
        return;
      }
      ctx.session.editServiceId = text;
      ctx.session.adminStep = "edit_choose_field";
      await ctx.reply(
        `✏️ *${svc.name}* — ဘာပြင်မလဲ?\n\n\`name\` — Service Name\n\`price\` — Item Price\n\`item_add\` — Item ထည့်\n\`item_del\` — Item ဖျက်`,
        { parse_mode: "Markdown" }
      );

    } else if (step === "edit_choose_field") {
      ctx.session.editField = text;
      const services = await getServices();
      const svc = services.find((s) => s.id === ctx.session.editServiceId);
      if (!svc) return;

      if (text === "name") {
        ctx.session.adminStep = "edit_set_name";
        await ctx.reply("Service Name အသစ် ရိုက်ပါ:");
      } else if (text === "price") {
        ctx.session.adminStep = "edit_choose_item";
        let txt = `Item ရွေးပါ (ID ရိုက်):\n\n`;
        for (const it of svc.items) {
          txt += `• \`${it.id}\` — ${it.label} (${it.price.toLocaleString()} ks)\n`;
        }
        await ctx.reply(txt, { parse_mode: "Markdown" });
      } else if (text === "item_add") {
        ctx.session.adminStep = "edit_add_item";
        ctx.session.newService = svc;
        await ctx.reply("Item အသစ် ထည့်ပါ:\n\nFormat: `label|price`", { parse_mode: "Markdown" });
      } else if (text === "item_del") {
        ctx.session.adminStep = "edit_del_item";
        let txt = `ဖျက်မည့် Item ID ရိုက်ပါ:\n\n`;
        for (const it of svc.items) {
          txt += `• \`${it.id}\` — ${it.label}\n`;
        }
        await ctx.reply(txt, { parse_mode: "Markdown" });
      }

    } else if (step === "edit_set_name") {
      await updateService(ctx.session.editServiceId!, { name: text });
      ctx.session.adminStep = undefined;
      await ctx.reply(`✅ Service Name "${text}" ပြင်ပြီးပါပြီ`);

    } else if (step === "edit_choose_item") {
      ctx.session.adminStep = "edit_set_price";
      ctx.session.editField = text;
      await ctx.reply("Price အသစ် ရိုက်ပါ (ks):");

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
      await ctx.reply(`✅ Price ${newPrice.toLocaleString()} ks ပြင်ပြီးပါပြီ`);

    } else if (step === "edit_add_item") {
      const parts = text.split("|");
      if (parts.length < 2) {
        await ctx.reply("❌ Format မှား — `label|price`", { parse_mode: "Markdown" });
        return;
      }
      const label = parts[0].trim();
      const price = parseInt(parts[1].trim().replace(/[^0-9]/g, ""), 10);
      const svc = ctx.session.newService!;
      const newItem: ServiceItem = { id: `${svc.id}_${Date.now()}`, label, price, unit: "ks" };
      const items = [...(svc.items ?? []), newItem];
      await updateService(svc.id!, { items });
      ctx.session.adminStep = undefined;
      await ctx.reply(`✅ "${label}" Item ထည့်ပြီးပါပြီ`);

    } else if (step === "edit_del_item") {
      const services = await getServices();
      const svc = services.find((s) => s.id === ctx.session.editServiceId);
      if (svc) {
        const items = svc.items.filter((it) => it.id !== text);
        await updateService(svc.id, { items });
      }
      ctx.session.adminStep = undefined;
      await ctx.reply(`✅ Item ဖျက်ပြီးပါပြီ`);

    // Delete service
    } else if (step === "delete_service") {
      await deleteService(text);
      ctx.session.adminStep = undefined;
      await ctx.reply(`✅ Service \`${text}\` ဖျက်ပြီးပါပြီ`, { parse_mode: "Markdown" });
    }
  }

  bot.catch((err) => {
    logger.error({ err: err.error, update: err.ctx?.update }, "Bot error");
  });

  return bot;
}
