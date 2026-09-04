import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { WinstonModule } from "nest-winston";

import appConfig from "./config/app.config";
import jwtConfig from "./config/jwt.config";
import uploadConfig from "./config/upload.config";
import { winstonConfig } from "./config/logger.config";
import { envValidationSchema } from "./config/env.validation";

import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./common/redis/redis.module";
import { RedisService } from "./common/redis/redis.service";
import { RedisThrottlerStorage } from "./common/redis/redis-throttler.storage";
import { TokenDenylistModule } from "./common/token-denylist/token-denylist.module";
import { SecurityLoggerModule } from "./common/security/security-logger.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { RolesModule } from "./modules/roles/roles.module";
import { PermissionsModule } from "./modules/permissions/permissions.module";
import { ArchivesModule } from "./modules/archives/archives.module";
import { LogsModule } from "./modules/logs/logs.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { HealthModule } from "./common/health/health.module";
import { FilesModule } from "./modules/files/files.module";
import { ClientsModule } from "./modules/clients/clients.module";
import { SystemModule } from "./modules/system/system.module";
import { NotariesModule } from "./modules/notaries/notaries.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { TasksModule } from "./modules/tasks/tasks.module";
import { NewsModule } from "./modules/news/news.module";
import { UafeFormsModule } from "./modules/uafe-forms/uafe-forms.module";

@Module({
  imports: [
    // Config with Joi validation — app fails at startup if env vars are invalid
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, jwtConfig, uploadConfig],
      envFilePath: [".env", ".env.local"],
      validationSchema: envValidationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),

    // Logger
    WinstonModule.forRootAsync({
      useFactory: winstonConfig,
    }),

    // Redis (global — must be before any module that uses RedisService)
    RedisModule,

    // Rate limiting — Redis-backed for distributed enforcement across pods.
    // Falls back to per-instance in-memory storage when Redis is unavailable.
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisService],
      useFactory: (redis: RedisService) => ({
        throttlers: [
          { name: "login",   ttl: 60_000,    limit: 5   }, // 5 login attempts/min
          { name: "refresh", ttl: 60_000,    limit: 10  }, // 10 refresh/min
          { name: "upload",  ttl: 60_000,    limit: 10  }, // 10 uploads/min
          { name: "pdf",     ttl: 60_000,    limit: 3   }, // 3 generate-pdf/min
          { name: "global",  ttl: 60_000,    limit: 60  }, // 60 req/min general
          { name: "hourly",  ttl: 3_600_000, limit: 500 }, // 500 req/hour
        ],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),

    // Core
    PrismaModule,
    TokenDenylistModule,
    SecurityLoggerModule,

    // Feature modules
    AuthModule,
    UsersModule,
    RolesModule,
    PermissionsModule,
    ArchivesModule,
    LogsModule,
    SettingsModule,
    HealthModule,
    FilesModule,
    ClientsModule,
    SystemModule,
    NotariesModule,
    NotificationsModule,
    TasksModule,
    NewsModule,
    UafeFormsModule,
  ],
  providers: [
    // Apply ThrottlerGuard globally — skippable per route with @SkipThrottle()
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
