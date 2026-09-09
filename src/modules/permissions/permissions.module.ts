import { Module } from "@nestjs/common";
import { PermissionsController } from "./permissions.controller";
import { PermissionsService } from "./permissions.service";
import { LogsModule } from "../logs/logs.module";
import { RealtimeModule } from "../realtime/realtime.module";

@Module({
  imports: [LogsModule, RealtimeModule],
  controllers: [PermissionsController],
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
