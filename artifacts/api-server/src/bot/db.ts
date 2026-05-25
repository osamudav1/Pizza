import { JsonDB, Config } from "node-json-db";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "../../data/bot-data");

export const db = new JsonDB(new Config(dbPath, true, true, "/"));

export interface Service {
  id: string;
  name: string;
  category: string;
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
  try {
    await db.getData("/services");
  } catch {
    const defaultServices: Service[] = [
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
    await db.push("/services", defaultServices);
  }

  // Migration: add Roblox to existing "others" service if missing
  try {
    const services: Service[] = await db.getData("/services");
    const othersIdx = services.findIndex((s) => s.id === "others");
    if (othersIdx !== -1) {
      const hasRoblox = services[othersIdx].items.some((i) => i.id === "others_roblox");
      if (!hasRoblox) {
        services[othersIdx].items.splice(-1, 0, {
          id: "others_roblox",
          label: "🎮 Roblox",
          price: 0,
          unit: "",
          requireContact: true,
        });
        await db.push("/services", services);
      }
    }
  } catch {}

  try {
    await db.getData("/orders");
  } catch {
    await db.push("/orders", []);
  }
}

ensureDefaults().catch(() => {});

export async function getServices(): Promise<Service[]> {
  try {
    return await db.getData("/services");
  } catch {
    return [];
  }
}

export async function saveOrder(order: Order): Promise<void> {
  let orders: Order[] = [];
  try {
    orders = await db.getData("/orders");
  } catch {}
  orders.push(order);
  await db.push("/orders", orders);
}

export async function updateOrder(orderId: string, updates: Partial<Order>): Promise<void> {
  let orders: Order[] = [];
  try {
    orders = await db.getData("/orders");
  } catch {}
  const idx = orders.findIndex((o) => o.orderId === orderId);
  if (idx !== -1) {
    orders[idx] = { ...orders[idx], ...updates, updatedAt: new Date().toISOString() };
    await db.push("/orders", orders);
  }
}

export async function getOrder(orderId: string): Promise<Order | null> {
  try {
    const orders: Order[] = await db.getData("/orders");
    return orders.find((o) => o.orderId === orderId) ?? null;
  } catch {
    return null;
  }
}

export async function addService(service: Service): Promise<void> {
  const services = await getServices();
  services.push(service);
  await db.push("/services", services);
}

export async function updateService(serviceId: string, updates: Partial<Service>): Promise<void> {
  const services = await getServices();
  const idx = services.findIndex((s) => s.id === serviceId);
  if (idx !== -1) {
    services[idx] = { ...services[idx], ...updates };
    await db.push("/services", services);
  }
}

export async function deleteService(serviceId: string): Promise<void> {
  const services = await getServices();
  const filtered = services.filter((s) => s.id !== serviceId);
  await db.push("/services", filtered);
}

export async function getPremiumEmoji(): Promise<string | null> {
  try {
    return await db.getData("/settings/premiumEmoji");
  } catch {
    return null;
  }
}

export async function setPremiumEmoji(emojiId: string): Promise<void> {
  await db.push("/settings/premiumEmoji", emojiId, true);
}

export async function getPremiumEmojiTag(fallback = "⭐"): Promise<string> {
  const id = await getPremiumEmoji();
  if (!id) return fallback;
  return `<tg-emoji emoji-id="${id}">${fallback}</tg-emoji>`;
}
