import logging
import random
import asyncio
from telegram import Update, constants
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes, MessageHandler, filters
from slot_bot_db import init_db, get_balance, update_balance, set_balance

# Configure logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)

# Owner ID (Replace with your Telegram User ID)
OWNER_ID = None # Will be set by the first person to use /setowner or hardcoded

SLOT_EMOJIS = ["🍎", "🍋", "🍒", "🔔", "💎", "7️⃣"]

def get_slot_result():
    return [random.choice(SLOT_EMOJIS) for _ in range(3)]

def calculate_win(result, bet):
    if result[0] == result[1] == result[2]:
        if result[0] == "7️⃣": return bet * 10
        if result[0] == "💎": return bet * 5
        return bet * 3
    elif result[0] == result[1] or result[1] == result[2] or result[0] == result[2]:
        return bet * 1.5
    return 0

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    init_db()
    await update.message.reply_text(
        f"🎰 Slot Bot မှ ကြိုဆိုပါတယ် {user.first_name}!\n\n"
        "💰 သင့်လက်ကျန်ငွေ: {get_balance(user.id)} MMK\n\n"
        "🎮 ဆော့ကစားနည်း:\n"
        ".slot [amount] - slot ဆော့ရန်\n"
        "ဥပမာ: .slot 1000\n\n"
        "Owner မှ ငွေသွင်းပေးရန် စောင့်ဆိုင်းပါ သို့မဟုတ် Admin ကို ဆက်သွယ်ပါ။"
    )

async def slot_game(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    text = update.message.text.split()
    
    if len(text) < 2:
        await update.message.reply_text("❌ ကျေးဇူးပြု၍ လောင်းကြေးထည့်ပါ။ ဥပမာ: .slot 1000")
        return

    try:
        bet = float(text[1])
    except ValueError:
        await update.message.reply_text("❌ မှားယွင်းသော ဂဏန်းဖြစ်နေပါသည်။")
        return

    if bet <= 0:
        await update.message.reply_text("❌ လောင်းကြေးသည် ၀ ထက်ကြီးရပါမည်။")
        return

    balance = get_balance(user.id)
    if balance < bet:
        await update.message.reply_text(f"❌ လက်ကျန်ငွေ မလုံလောက်ပါ။ လက်ရှိ: {balance} MMK")
        return

    # Deduct bet
    update_balance(user.id, -bet, user.username)
    
    # Animation
    msg = await update.message.reply_text("🎰 Spinning... [ ❓ | ❓ | ❓ ]")
    
    for i in range(3):
        await asyncio.sleep(0.5)
        temp_res = [random.choice(SLOT_EMOJIS) for _ in range(3)]
        await msg.edit_text(f"🎰 Spinning... [ {temp_res[0]} | {temp_res[1]} | {temp_res[2]} ]")

    final_result = get_slot_result()
    win_amount = calculate_win(final_result, bet)
    
    result_text = f"🎰 Result: [ {final_result[0]} | {final_result[1]} | {final_result[2]} ]\n\n"
    
    if win_amount > 0:
        update_balance(user.id, win_amount, user.username)
        result_text += f"🎉 ဂုဏ်ယူပါတယ်! သင် {win_amount} MMK နိုင်ပါတယ်!"
    else:
        result_text += "💸 ကံမကောင်းပါဘူး၊ နောက်တစ်ခေါက် ပြန်ကြိုးစားကြည့်ပါ။"
    
    result_text += f"\n💰 လက်ရှိလက်ကျန်: {get_balance(user.id)} MMK"
    await msg.edit_text(result_text)

async def admin_manage_balance(update: Update, context: ContextTypes.DEFAULT_TYPE):
    global OWNER_ID
    
    # Simple security: check if sender is owner
    if OWNER_ID and update.effective_user.id != OWNER_ID:
        return

    if not update.message.reply_to_message:
        return

    text = update.message.text
    try:
        # Check for +amount or -amount
        if text.startswith('+') or text.startswith('-'):
            amount = float(text)
            target_user = update.message.reply_to_message.from_user
            update_balance(target_user.id, amount, target_user.username)
            
            action = "သွင်းပေးလိုက်ပါပြီ" if amount > 0 else "နှုတ်လိုက်ပါပြီ"
            await update.message.reply_text(
                f"✅ {target_user.first_name} အတွက် {abs(amount)} MMK {action}။\n"
                f"💰 လက်ရှိလက်ကျန်: {get_balance(target_user.id)} MMK"
            )
    except ValueError:
        pass

async def set_owner(update: Update, context: ContextTypes.DEFAULT_TYPE):
    global OWNER_ID
    if OWNER_ID is None:
        OWNER_ID = update.effective_user.id
        await update.message.reply_text(f"👑 သင့်ကို Owner အဖြစ် သတ်မှတ်လိုက်ပါပြီ (ID: {OWNER_ID})")
    else:
        await update.message.reply_text("❌ Owner သတ်မှတ်ပြီးသားဖြစ်ပါသည်။")

if __name__ == '__main__':
    init_db()
    # Replace 'YOUR_BOT_TOKEN' with your actual bot token from @BotFather
    TOKEN = "YOUR_BOT_TOKEN"
    
    application = ApplicationBuilder().token(TOKEN).build()
    
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("setowner", set_owner))
    application.add_handler(MessageHandler(filters.Regex(r'^\.slot\s+\d+'), slot_game))
    application.add_handler(MessageHandler(filters.REPLY & filters.TEXT, admin_manage_balance))
    
    print("Bot is running...")
    application.run_polling()
