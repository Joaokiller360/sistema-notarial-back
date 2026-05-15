import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { S3Service } from "../../common/s3/s3.service";
import { CreateNewsDto } from "./dto/create-news.dto";

@Injectable()
export class NewsService {
  constructor(
    private prisma: PrismaService,
    private s3: S3Service,
  ) {}

  async findAll({ page, limit }: { page: number; limit: number }) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.prisma.$transaction([
      this.prisma.news.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.news.count(),
    ]);

    const dataWithUrls = await Promise.all(
      data.map(async (item) => {
        if (!item.imageUrl) return item;
        const key = new URL(item.imageUrl).pathname.replace(/^\//, "");
        const signedUrl = await this.s3.getSignedUrl(key, 3600);
        return { ...item, imageUrl: signedUrl };
      }),
    );

    return {
      data: dataWithUrls,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(dto: CreateNewsDto, image?: Express.Multer.File) {
    let imageUrl: string | null = null;

    if (image) {
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
