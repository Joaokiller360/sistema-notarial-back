import { Controller, Get, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { Public } from "../decorators/public.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { S3Service } from "../s3/s3.service";

@ApiTags("Health")
@SkipThrottle()
@Public()
@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly s3: S3Service,
  ) {}

  /**
   * Liveness probe — answers "is the process alive and not deadlocked?"
   * K8s restarts the pod if this fails. Must never query external deps.
   */
  @Get("live")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Liveness probe — process is alive" })
  live() {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness probe — answers "can this pod serve traffic?"
   * K8s removes the pod from the load-balancer rotation if this fails.
   * Returns 503 when any required dependency is down.
   */
  @Get("ready")
  @ApiOperation({ summary: "Readiness probe — all dependencies up" })
  async ready() {
    const [dbStatus, redisStatus] = await Promise.all([
      this.checkDb(),
      this.checkRedis(),
    ]);

    const allOk = dbStatus === "ok";
    return {
      status: allOk ? "ok" : "degraded",
      statusCode: allOk ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        redis: redisStatus,
        api: "ok",
      },
      version: process.env.SYSTEM_VERSION || "1.0.0",
    };
  }

  /**
   * Full health check — backward-compatible with existing monitoring.
   * Includes all dependency statuses; does not return 503 to avoid
   * breaking legacy healthcheck scripts that don't handle non-200.
   */
  @Get()
  @ApiOperation({ summary: "Full health check (legacy-compatible)" })
  async check() {
    const [dbStatus, redisStatus] = await Promise.all([
      this.checkDb(),
      this.checkRedis(),
    ]);

    return {
      status: dbStatus === "ok" ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        redis: redisStatus,
        api: "ok",
      },
      version: process.env.SYSTEM_VERSION || "1.0.0",
    };
  }

  private async checkDb(): Promise<"ok" | "error"> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return "ok";
    } catch {
      return "error";
    }
  }

  private async checkRedis(): Promise<"ok" | "disabled" | "error"> {
    if (!process.env.REDIS_URL) return "disabled";
    return (await this.redis.ping()) ? "ok" : "error";
  }
}
