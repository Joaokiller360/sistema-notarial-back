import { Injectable, NotFoundException } from "@nestjs/common";
import { promises as fs } from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateNewsDto } from "./dto/create-news.dto";

const EXT_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const FORMAT_MAP: Record<string, keyof sharp.FormatEnum> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

@Injectable()
export class NewsService {
  constructor(private prisma: PrismaService) {}

  private async saveImageLocally(buffer: Buffer, mimeType: string): Promise<{
    imageUrl: string;
    rotated: boolean;
    original_orientation: "landscape" | "portrait";
    final_dimensions: { width: number; height: number };
  }> {
    const format = FORMAT_MAP[mimeType] ?? "jpeg";

    const meta = await sharp(buffer).metadata();
    const rawWidth = meta.width ?? 0;
    const rawHeight = meta.height ?? 0;
    const original_orientation: "landscape" | "portrait" =
      rawWidth > rawHeight ? "landscape" : "portrait";

    const { data: exifFixed, info: exifInfo } = await sharp(buffer)
      .rotate()
      .toFormat(format)
      .toBuffer({ resolveWithObject: true });

    let rotated = exifInfo.width !== rawWidth || exifInfo.height !== rawHeight;
    let finalBuffer = exifFixed;
    let finalWidth = exifInfo.width;
    let finalHeight = exifInfo.height;

    if (finalWidth > finalHeight) {
      const { data: cwFixed, info: cwInfo } = await sharp(exifFixed)
        .rotate(90)
        .toFormat(format)
        .toBuffer({ resolveWithObject: true });
      finalBuffer = cwFixed;
      finalWidth = cwInfo.width;
      finalHeight = cwInfo.height;
      rotated = true;
    }

    const uploadDest = process.env.UPLOAD_DEST || "./uploads";
    const newsDir = path.resolve(uploadDest, "news");
    await fs.mkdir(newsDir, { recursive: true });

    const ext = EXT_MAP[mimeType] ?? "bin";
    const filename = `${uuidv4()}.${ext}`;
    await fs.writeFile(path.join(newsDir, filename), finalBuffer);

    const baseUrl =
      process.env.APP_BASE_URL ||
      `http://localhost:${process.env.PORT || 3000}`;
    const imageUrl = `${baseUrl}/uploads/news/${filename}`;

    return {
      imageUrl,
      rotated,
      original_orientation,
      final_dimensions: { width: finalWidth, height: finalHeight },
    };
  }

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
      const result = await this.saveImageLocally(image.buffer, image.mimetype);
      imageUrl = result.imageUrl;
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

    if (news.imageUrl) {
      try {
        const url = new URL(news.imageUrl);
        const filePath = path.resolve(
          process.env.UPLOAD_DEST || "./uploads",
          url.pathname.replace(/^\/uploads\//, ""),
        );
        await fs.unlink(filePath);
      } catch {
        // file may not exist; continue
      }
    }

    await this.prisma.news.delete({ where: { id } });
  }
}
