import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { S3Service } from "../../common/s3/s3.service";
import { AntivirusService } from "../../common/antivirus/antivirus.service";
import { CreateNewsDto } from "./dto/create-news.dto";

@Injectable()
export class NewsService {
  constructor(
    private prisma: PrismaService,
    private s3: S3Service,
    private antivirus: AntivirusService,
  ) {}

  async create(dto: CreateNewsDto, image?: Express.Multer.File) {
    let imageUrl: string | null = null;

    if (image) {
      await this.antivirus.scan(image.buffer);
      imageUrl = await this.s3.uploadImage(image.buffer, image.mimetype);
    }

    const news = await this.prisma.news.create({
      data: {
        title: dto.title,
        description: dto.description,
        imageUrl,
      },
    });

    return news;
  }
}
