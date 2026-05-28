import mongoose, { Schema, Document } from "mongoose";

const MONGO_URI = process.env["MONGO_URI"] || "mongodb://localhost:27017/pizza_bot";

export interface IService extends Document {
  id: string;
  name: string;
  category: string;
  photo?: string;
  caption?: string;
  targetType?: string;
  items: {
    id: string;
    label: string;
    price: number;
    unit: string;
    requireContact?: boolean;
  }[];
}

const ServiceSchema: Schema = new Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  category: { type: String, required: true },
  photo: { type: String },
  caption: { type: String },
  targetType: { type: String },
  items: [{
    id: { type: String, required: true },
    label: { type: String, required: true },
    price: { type: Number, required: true },
    unit: { type: String, required: true },
    requireContact: { type: Boolean }
  }]
});

export interface IOrder extends Document {
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
  status: string;
  messageId?: number;
  ownerMessageId?: number;
  createdAt: string;
  updatedAt: string;
}

const OrderSchema: Schema = new Schema({
  orderId: { type: String, required: true, unique: true },
  userId: { type: Number, required: true },
  username: { type: String },
  firstName: { type: String },
  serviceId: { type: String, required: true },
  serviceName: { type: String, required: true },
  itemId: { type: String, required: true },
  itemLabel: { type: String, required: true },
  itemPrice: { type: Number, required: true },
  quantity: { type: String },
  targetInfo: { type: String },
  receiptFileId: { type: String },
  receiptCaption: { type: String },
  status: { type: String, required: true },
  messageId: { type: Number },
  ownerMessageId: { type: Number },
  createdAt: { type: String, required: true },
  updatedAt: { type: String, required: true }
});

export interface IWelcome extends Document {
  photo?: string;
  caption?: string;
}

const WelcomeSchema: Schema = new Schema({
  photo: { type: String },
  caption: { type: String }
});

export interface IPremiumEmoji extends Document {
  emoji: string;
  emojiId: string;
}

const PremiumEmojiSchema: Schema = new Schema({
  emoji: { type: String, required: true, unique: true },
  emojiId: { type: String, required: true }
});

export const ServiceModel = mongoose.model<IService>("Service", ServiceSchema);
export const OrderModel = mongoose.model<IOrder>("Order", OrderSchema);
export const WelcomeModel = mongoose.model<IWelcome>("Welcome", WelcomeSchema);
export const PremiumEmojiModel = mongoose.model<IPremiumEmoji>("PremiumEmoji", PremiumEmojiSchema);

export async function connectDB() {
  if (mongoose.connection.readyState >= 1) return;
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}
