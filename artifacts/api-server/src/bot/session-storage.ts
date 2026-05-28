import { StorageAdapter } from "grammy";
import { db } from "./db";

export class JsonDbSessionStorage<T> implements StorageAdapter<T> {
  private prefix: string;
  private cache: Map<string, T> = new Map();

  constructor(prefix = "sessions") {
    this.prefix = prefix;
  }

  private key(k: string) {
    return `/${this.prefix}/${k.replace(/\//g, "_")}`;
  }

  async read(key: string): Promise<T | undefined> {
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }
    try {
      const data = await db.getData(this.key(key));
      if (data) {
        this.cache.set(key, data as T);
      }
      return data as T;
    } catch {
      return undefined;
    }
  }

  async write(key: string, value: T): Promise<void> {
    this.cache.set(key, value);
    // Fire and forget persistence to speed up response
    db.push(this.key(key), value, true).catch(console.error);
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
    try {
      await db.delete(this.key(key));
    } catch {}
  }
}
