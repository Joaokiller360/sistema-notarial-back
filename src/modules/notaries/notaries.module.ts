import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { NotariesController } from "./notaries.controller";
import { NotariesService } from "./notaries.service";

@Module({
  imports: [PrismaModule],
  controllers: [NotariesController],
  providers: [NotariesService],
  exports: [NotariesService],
})
export class NotariesModule {}
