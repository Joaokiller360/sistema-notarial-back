import { Module } from "@nestjs/common";
import { NewsController } from "./news.controller";
import { NewsService } from "./news.service";
import { S3Module } from "../../common/s3/s3.module";

@Module({
  imports: [S3Module],
  controllers: [NewsController],
  providers: [NewsService],
})
export class NewsModule {}
