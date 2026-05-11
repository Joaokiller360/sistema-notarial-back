import { Module } from "@nestjs/common";
import { ArchivesController } from "./archives.controller";
import { ArchivesService } from "./archives.service";
import { LogsModule } from "../logs/logs.module";
import { S3Module } from "../../common/s3/s3.module";

@Module({
  imports: [LogsModule, S3Module],
  controllers: [ArchivesController],
  providers: [ArchivesService],
  exports: [ArchivesService],
})
export class ArchivesModule {}
