import { StorageAdapter } from "grammy";
import { db } from "./db";

export class JsonDbSessionStorage<T> implements StorageAdapter<T> {
  private prefix: string;

  constructor(prefix = "sessions") {
    this.prefix = prefix;
  }

  private key(k: string) {
    return `/${this.prefix}/${k.replace(/\//g, "_")}`;
  }

  async read(key: string): Promise<T | undefined> {
    try {
      return await db.getData(this.key(key));
    } catch {
      return undefined;
    }
  }

  async write(key: string, value: T): Promise<void> {
    await db.push(this.key(key), value, true);
  }

  async delete(key: string): Promise<void> {
    try {
      await db.delete(this.key(key));
    } catch {}
  }
}
