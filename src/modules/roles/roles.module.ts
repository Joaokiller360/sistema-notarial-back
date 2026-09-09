import { Module } from "@nestjs/common";
import { RolesController } from "./roles.controller";
import { RolesService } from "./roles.service";
import { LogsModule } from "../logs/logs.module";
import { RealtimeModule } from "../realtime/realtime.module";

@Module({
  imports: [LogsModule, RealtimeModule],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
