import { Injectable, NotFoundException } from "@nestjs/common";
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

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const news = await this.prisma.news.findUnique({ where: { id } });
    if (!news) throw new NotFoundException("Noticia no encontrada");
    return news;
  }

  async create(dto: CreateNewsDto, image?: Express.Multer.File) {
    let imageUrl: string | null = null;
    let imageMetadata: {
      rotated: boolean;
      original_orientation: "landscape" | "portrait";
      final_dimensions: { width: number; height: number };
    } | null = null;

    if (image) {
      // Upload directly to S3 — no local disk storage
      const result = await this.s3.uploadImage(image.buffer, image.mimetype);
      imageUrl = result.url;
      imageMetadata = {
        rotated: result.rotated,
        original_orientation: result.original_orientation,
        final_dimensions: result.final_dimensions,
      };
    }

    const news = await this.prisma.news.create({
      data: {
        title: dto.title,
        description: dto.description,
        imageUrl,
      },
    });

    return {
      ...news,
      ...(imageMetadata ?? {}),
    };
  }

  async remove(id: string) {
    const news = await this.prisma.news.findUnique({ where: { id } });
    if (!news) throw new NotFoundException("Noticia no encontrada");

    // Delete image from S3 if it exists (best-effort; non-fatal on failure)
    if (news.imageUrl) {
      try {
        // Extract the S3 key from the URL: https://bucket.s3.region.amazonaws.com/news/uuid.ext
        const url = new URL(news.imageUrl);
        const key = url.pathname.replace(/^\//, ""); // strip leading slash
        if (key.startsWith("news/")) {
          await this.s3.deleteFile(key);
        }
      } catch {
        // Non-fatal: S3 object may already be gone
      }
    }

    await this.prisma.news.delete({ where: { id } });
  }
}
