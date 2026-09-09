import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { LogsModule } from "../logs/logs.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { ProtectSuperAdminGuard } from "../../common/guards/protect-super-admin.guard";
import { NotarioRestrictionGuard } from "../../common/guards/notario-restriction.guard";

@Module({
  imports: [LogsModule, RealtimeModule],
  controllers: [UsersController],
  providers: [UsersService, ProtectSuperAdminGuard, NotarioRestrictionGuard],
  exports: [UsersService],
})
export class UsersModule {}
