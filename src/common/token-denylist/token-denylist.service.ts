import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";

/**
 * Hybrid access-token denylist: Redis primary, in-memory fallback.
 *
 * Redis mode (multi-instance):
 *   - Revoked tokens are shared across all pods.
 *   - TTL matches the token's remaining lifetime.
 *   - Key: `revoked:<jti>` → value "1".
 *
 * In-memory fallback (Redis down / single-instance):
 *   - Revocations are local to the pod.
 *   - A logged-out token can still be used on other pods for up to 15 min.
 *   - This is logged as a warning so ops can detect Redis failure quickly.
 */
@Injectable()
export class TokenDenylistService {
  private readonly logger = new Logger(TokenDenylistService.name);
  private readonly denied = new Map<string, number>();

  constructor(private readonly redis: RedisService) {
    setInterval(() => this.purgeExpired(), 10 * 60 * 1000).unref();
  }

  async deny(jti: string, expiresAtSeconds: number): Promise<void> {
    const ttl = expiresAtSeconds - Math.floor(Date.now() / 1000);
    if (ttl <= 0) return;

    if (this.redis.isAvailable()) {
      try {
        await this.redis.setex(`revoked:${jti}`, ttl, "1");
        return;
      } catch (err) {
        this.logger.warn(
          `Redis deny failed — in-memory fallback active: ${(err as Error).message}`,
        );
      }
    }

    this.denied.set(jti, expiresAtSeconds);
  }

  async isDenied(jti: string): Promise<boolean> {
    if (this.redis.isAvailable()) {
      try {
        return await this.redis.exists(`revoked:${jti}`);
      } catch (err) {
        this.logger.warn(
          `Redis isDenied failed — in-memory fallback active: ${(err as Error).message}`,
        );
      }
    }

    return this.memoryIsDenied(jti);
  }

  private memoryIsDenied(jti: string): boolean {
    const exp = this.denied.get(jti);
    if (exp === undefined) return false;
    if (Math.floor(Date.now() / 1000) > exp) {
      this.denied.delete(jti);
      return false;
    }
    return true;
  }

  private purgeExpired(): void {
    const now = Math.floor(Date.now() / 1000);
    for (const [jti, exp] of this.denied) {
      if (now > exp) this.denied.delete(jti);
    }
  }
}
