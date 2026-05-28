import { ServiceModel, OrderModel, WelcomeModel, PremiumEmojiModel, connectDB, IService, IOrder } from "./mongodb";

export interface Service {
  id: string;
  name: string;
  category: string;
  photo?: string;
  caption?: string;
  targetType?: string;
  items: ServiceItem[];
}

export interface ServiceItem {
  id: string;
  label: string;
  price: number;
  unit: string;
  requireContact?: boolean;
}

export interface Order {
  orderId: string;
  userId: number;
  username?: string;
  firstName?: string;
  serviceId: string;
  serviceName: string;
  itemId: string;
  itemLabel: string;
  itemPrice: number;
  quantity?: string;
  targetInfo?: string;
  receiptFileId?: string;
  receiptCaption?: string;
  status: "pending_receipt" | "pending_confirm" | "confirmed" | "rejected" | "processing" | "completed";
  messageId?: number;
  ownerMessageId?: number;
  createdAt: string;
  updatedAt: string;
}

async function ensureDefaults() {
  await connectDB();
  const count = await ServiceModel.countDocuments();
  if (count === 0) {
    const defaultServices = [
      {
        id: "tg_boost",
        name: "🚀 Telegram Boost",
        category: "main",
        items: [
          { id: "tg_boost_1k", label: "1,000 Subscribers", price: 7000, unit: "ks" },
          { id: "tg_boost_500", label: "500 Subscribers", price: 4000, unit: "ks" },
          { id: "tg_boost_100", label: "100 Subscribers", price: 1000, unit: "ks" },
        ],
      },
      {
        id: "tiktok",
        name: "🎵 TikTok Like/View",
        category: "main",
        items: [
          { id: "tiktok_like_1k", label: "1,000 Likes", price: 2000, unit: "ks" },
          { id: "tiktok_view_1k", label: "1,000 Views", price: 1500, unit: "ks" },
          { id: "tiktok_like_5k", label: "5,000 Likes", price: 9000, unit: "ks" },
        ],
      },
      {
        id: "tg_star",
        name: "⭐ Telegram Stars",
        category: "main",
        items: [
          { id: "tg_star_50", label: "50 Stars", price: 3000, unit: "ks" },
          { id: "tg_star_100", label: "100 Stars", price: 5500, unit: "ks" },
          { id: "tg_star_500", label: "500 Stars", price: 25000, unit: "ks" },
        ],
      },
      {
        id: "dia",
        name: "💎 Diamonds (Dia)",
        category: "main",
        targetType: "dia",
        items: [
          { id: "dia_100", label: "100 Diamonds", price: 2500, unit: "ks" },
          { id: "dia_500", label: "500 Diamonds", price: 12000, unit: "ks" },
          { id: "dia_1000", label: "1,000 Diamonds", price: 23000, unit: "ks" },
        ],
      },
      {
        id: "uc",
        name: "🎮 UC (PUBG)",
        category: "main",
        targetType: "uc",
        items: [
          { id: "uc_60", label: "60 UC", price: 1500, unit: "ks" },
          { id: "uc_325", label: "325 UC", price: 7000, unit: "ks" },
          { id: "uc_660", label: "660 UC", price: 13000, unit: "ks" },
        ],
      },
      {
        id: "others",
        name: "📦 အခြား Services များ",
        category: "contact",
        items: [
          { id: "others_tg_acc", label: "Telegram Account", price: 0, unit: "", requireContact: true },
          { id: "others_premium", label: "Telegram Premium", price: 0, unit: "", requireContact: true },
          { id: "others_roblox", label: "🎮 Roblox", price: 0, unit: "", requireContact: true },
          { id: "others_custom", label: "တခြား Services", price: 0, unit: "", requireContact: true },
        ],
      },
    ];
    await ServiceModel.insertMany(defaultServices);
  }
}

ensureDefaults().catch(console.error);

export const db = {
  getData: async (path: string) => {
    return {}; 
  },
  push: async (path: string, data: any, override: boolean) => {},
  delete: async (path: string) => {},
};

export async function getServices(): Promise<Service[]> {
  await connectDB();
  const docs = await ServiceModel.find().lean();
  return docs.map(d => ({
    id: d.id,
    name: d.name,
    category: d.category,
    photo: d.photo,
    caption: d.caption,
    targetType: d.targetType,
    items: d.items.map(i => ({
      id: i.id,
      label: i.label,
      price: i.price,
      unit: i.unit,
      requireContact: i.requireContact
    }))
  }));
}

export async function saveOrder(order: Order): Promise<void> {
  await connectDB();
  await OrderModel.create(order);
}

export async function updateOrder(orderId: string, updates: Partial<Order>): Promise<void> {
  await connectDB();
  await OrderModel.findOneAndUpdate({ orderId }, { ...updates, updatedAt: new Date().toISOString() });
}

export async function getOrder(orderId: string): Promise<Order | null> {
  await connectDB();
  const doc = await OrderModel.findOne({ orderId }).lean();
  return doc as any;
}

export async function addService(service: Service): Promise<void> {
  await connectDB();
  await ServiceModel.create(service);
}

export async function updateService(serviceId: string, updates: Partial<Service>): Promise<void> {
  await connectDB();
  await ServiceModel.findOneAndUpdate({ id: serviceId }, updates);
}

export async function deleteService(serviceId: string): Promise<void> {
  await connectDB();
  await ServiceModel.findOneAndDelete({ id: serviceId });
}

export async function getPremiumEmoji(): Promise<string | null> {
  // Logic for premium emoji settings can be stored in a separate collection or as a specific doc
  return null; // Placeholder
}

export async function setPremiumEmoji(emojiId: string): Promise<void> {
  // Placeholder
}

export async function getWelcomeMedia(): Promise<{ photo?: string; caption?: string } | null> {
  await connectDB();
  const doc = await WelcomeModel.findOne().lean();
  return doc ? { photo: doc.photo, caption: doc.caption } : null;
}

export async function setWelcomeMedia(updates: { photo?: string; caption?: string }): Promise<void> {
  await connectDB();
  const current = await WelcomeModel.findOne();
  if (current) {
    await WelcomeModel.findByIdAndUpdate(current._id, updates);
  } else {
    await WelcomeModel.create(updates);
  }
}

export async function getPremiumEmojiTag(fallback = "⭐"): Promise<string> {
  return fallback;
}
