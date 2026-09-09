import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
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
import { AuditInterceptor } from "./common/interceptors/audit.interceptor";
import { UserThrottlerGuard } from "./common/guards/user-throttler.guard";

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
          // Ráfaga: un dashboard al montar dispara ~10-30 GET en paralelo
          // (x2 con React StrictMode en dev) + polling. 150/min deja aire y
          // sigue frenando scraping. Rutas sensibles se aprietan por-ruta con
          // @Throttle({ short: {...} }) — el contador es por handler + tracker.
          { name: "short", ttl: 60_000,    limit: 150  },
          // Techo sostenido anti-abuso por usuario/IP.
          { name: "long",  ttl: 3_600_000, limit: 3000 },
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
    // Throttler global, tracking por-usuario (JWT) con fallback a IP.
    // Skippable por ruta con @SkipThrottle(); ajustable con @Throttle().
    {
      provide: APP_GUARD,
      useClass: UserThrottlerGuard,
    },
    // Persist an audit row in `logs` for every mutation / search / download /
    // auth request. Registered here (not in main.ts) so it can inject LogsService.
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
