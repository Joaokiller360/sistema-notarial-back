import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { LogsModule } from "../logs/logs.module";
import { ProtectSuperAdminGuard } from "../../common/guards/protect-super-admin.guard";
import { NotarioRestrictionGuard } from "../../common/guards/notario-restriction.guard";

@Module({
  imports: [LogsModule],
  controllers: [UsersController],
  providers: [UsersService, ProtectSuperAdminGuard, NotarioRestrictionGuard],
  exports: [UsersService],
})
export class UsersModule {}
