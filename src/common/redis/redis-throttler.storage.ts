import { RedisService } from "./redis.service";

interface StorageRecord {
  totalHits: number;
  timeToExpire: number;
}

interface MemRecord {
  hits: number;
  expiresAt: number;
}

/**
 * Distributed throttler storage backed by Redis with automatic in-memory
 * fallback when Redis is unavailable.
 *
 * Implements the @nestjs/throttler v5 ThrottlerStorage interface via
 * structural typing (increment(key, ttl) → StorageRecord).
 *
 * Fallback behavior: per-instance limits remain active. Effective limit
 * becomes N×limit for N pods during Redis outage — not disabled, just wider.
 */
export class RedisThrottlerStorage {
  private readonly mem = new Map<string, MemRecord>();

  constructor(private readonly redis: RedisService) {}

  async increment(key: string, ttl: number): Promise<StorageRecord> {
    const client = this.redis.getClient();
    if (client) {
      try {
        return await this.redisIncrement(client, key, ttl);
      } catch {
        // Fall through to in-memory on transient Redis error
      }
    }
    return this.memIncrement(key, ttl);
  }

  private async redisIncrement(
    client: NonNullable<ReturnType<RedisService["getClient"]>>,
    key: string,
    ttl: number,
  ): Promise<StorageRecord> {
    const [[, totalHits], [, pttl]] = (await client
      .pipeline()
      .incr(key)
      .pttl(key)
      .exec()) as [[null, number], [null, number]];

    if (totalHits === 1 || pttl === -1) {
      await client.pexpire(key, ttl);
      return { totalHits, timeToExpire: ttl };
    }

    return { totalHits, timeToExpire: Math.max(0, pttl) };
  }

  private memIncrement(key: string, ttl: number): StorageRecord {
    const now = Date.now();
    const rec = this.mem.get(key);

    if (!rec || now >= rec.expiresAt) {
      this.mem.set(key, { hits: 1, expiresAt: now + ttl });
      return { totalHits: 1, timeToExpire: ttl };
    }

    rec.hits += 1;
    return { totalHits: rec.hits, timeToExpire: Math.max(0, rec.expiresAt - now) };
  }
}
