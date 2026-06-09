# Telegram Slot Bot (MMK)

ဤ Bot သည် Telegram Group များတွင် MMK (မြန်မာကျပ်ငွေ) ဖြင့် Slot ဆော့ကစားနိုင်ရန် ပြုလုပ်ထားခြင်းဖြစ်သည်။

## အဓိက ပါဝင်သော Feature များ:
- **Slot Game**: `.slot [amount]` command ဖြင့် ဆော့ကစားနိုင်သည်။
- **Animation**: Slot လှည့်နေသည့် ပုံစံ animation ပါဝင်သည်။
- **MMK Balance**: အသုံးပြုသူတစ်ဦးချင်းစီ၏ balance ကို SQLite database ဖြင့် သိမ်းဆည်းပေးသည်။
- **Owner System**: Owner သည် user ၏ message ကို reply ပြန်ပြီး `+amount` သို့မဟုတ် `-amount` ရိုက်ရုံဖြင့် ငွေသွင်း/ငွေထုတ် ပြုလုပ်ပေးနိုင်သည်။

## အသုံးပြုနည်း:

1. **Bot Token ရယူပါ**: Telegram @BotFather တွင် Bot အသစ်တစ်ခုဆောက်ပြီး Token ကို ယူပါ။
2. **Setup လုပ်ပါ**: `slot_bot.py` ထဲရှိ `YOUR_BOT_TOKEN` နေရာတွင် သင်ရရှိလာသော Token ကို ထည့်ပါ။
3. **Run ပါ**: `python3 slot_bot.py` ကို run ပါ။
4. **Owner သတ်မှတ်ပါ**: Bot ထဲတွင် `/setowner` ဟု ပထမဆုံးရိုက်သူသည် Owner ဖြစ်လာပါမည်။
5. **ငွေသွင်းခြင်း**: User တစ်ယောက်၏ message ကို reply ဆွဲပြီး `+5000` ဟု ရိုက်ပါက ထို user ထဲသို့ ၅၀၀၀ ကျပ် ရောက်သွားပါမည်။

## လိုအပ်သော Library များ:
```bash
pip install python-telegram-bot
```

## Developer Note:
ဤ bot သည် Python ဖြင့် ရေးသားထားပြီး SQLite database ကို အသုံးပြုထားသောကြောင့် ပေါ့ပါးသွက်လက်ပြီး group ထဲတွင်လည်း အဆင်ပြေပြေ အသုံးပြုနိုင်ပါသည်။
