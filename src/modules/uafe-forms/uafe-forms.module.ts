import { Module } from "@nestjs/common";
import { UafeFormsController } from "./uafe-forms.controller";
import { UafeFormsService } from "./uafe-forms.service";
import { LogsModule } from "../logs/logs.module";

@Module({
  imports: [LogsModule],
  controllers: [UafeFormsController],
  providers: [UafeFormsService],
})
export class UafeFormsModule {}
