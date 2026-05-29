import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private _available = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const url = this.config.get<string>("REDIS_URL");
    if (!url) {
      this.logger.warn(
        "REDIS_URL not configured — Redis disabled, in-memory fallbacks active",
      );
      return;
    }

    this.client = new Redis(url, {
      enableReadyCheck: true,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 5_000,
      commandTimeout: 2_000,
    });

    this.client.on("ready", () => {
      this._available = true;
      this.logger.log("Redis connected");
    });

    this.client.on("error", (err: Error) => {
      if (this._available) {
        this.logger.warn(
          `Redis error — degraded to in-memory: ${err.message}`,
        );
      }
      this._available = false;
    });

    this.client.on("close", () => {
      this._available = false;
    });

    this.client.on("reconnecting", () => {
      this.logger.log("Redis reconnecting...");
    });

    try {
      await this.client.connect();
    } catch {
      this.logger.warn(
        "Redis initial connection failed — operating in degraded mode",
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        this.client.disconnect();
      }
    }
  }

  isAvailable(): boolean {
    return this._available;
  }

  getClient(): Redis | null {
    return this._available ? this.client : null;
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    const client = this.getClient();
    if (!client) return;
    try {
      await client.setex(key, ttlSeconds, value);
    } catch (err) {
      this._available = false;
      this.logger.warn(`Redis setex failed: ${(err as Error).message}`);
    }
  }

  async exists(key: string): Promise<boolean> {
    const client = this.getClient();
    if (!client) return false;
    try {
      return (await client.exists(key)) === 1;
    } catch (err) {
      this._available = false;
      this.logger.warn(`Redis exists failed: ${(err as Error).message}`);
      return false;
    }
  }

  async ping(): Promise<boolean> {
    const client = this.getClient();
    if (!client) return false;
    try {
      return (await client.ping()) === "PONG";
    } catch {
      return false;
    }
  }
}
