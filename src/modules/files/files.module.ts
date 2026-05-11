import { Module } from "@nestjs/common";
import { FilesController } from "./files.controller";
import { S3Module } from "../../common/s3/s3.module";

@Module({
  imports: [S3Module],
  controllers: [FilesController],
})
export class FilesModule {}
