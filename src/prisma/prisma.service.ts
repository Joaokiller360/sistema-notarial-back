import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

const SLOW_QUERY_THRESHOLD_MS = process.env.NODE_ENV === "production" ? 1_000 : 300;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: "event", level: "query" },
        { emit: "event", level: "error" },
        { emit: "event", level: "warn" },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log("Database connected");

    // Log slow queries in all environments — threshold is higher in production
    // to reduce noise while still catching problematic queries before they
    // exhaust the connection pool.
    (this as any).$on("query", (e: any) => {
      if (e.duration > SLOW_QUERY_THRESHOLD_MS) {
        this.logger.warn(
          `Slow query (${e.duration}ms): ${e.query.slice(0, 200)}`,
        );
      }
    });

    (this as any).$on("error", (e: any) => {
      this.logger.error(`Prisma error: ${e.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log("Database disconnected");
  }

  /** Soft-delete helper: sets deletedAt to now */
  async softDelete(model: string, id: string) {
    return (this as any)[model].update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
