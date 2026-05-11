import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { WinstonModule } from "nest-winston";

import appConfig from "./config/app.config";
import jwtConfig from "./config/jwt.config";
import uploadConfig from "./config/upload.config";
import { winstonConfig } from "./config/logger.config";

import { PrismaModule } from "./prisma/prisma.module";
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

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, jwtConfig, uploadConfig],
      envFilePath: [".env", ".env.local"],
    }),

    // Logger
    WinstonModule.forRootAsync({
      useFactory: winstonConfig,
    }),

    // Rate limiting
    ThrottlerModule.forRootAsync({
      useFactory: () => [
        {
          ttl: parseInt(process.env.THROTTLE_TTL || "60", 10) * 1000,
          limit: parseInt(process.env.THROTTLE_LIMIT || "100", 10),
        },
      ],
    }),

    // Core
    PrismaModule,

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
  ],
})
export class AppModule {}
