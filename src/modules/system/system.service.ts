import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { LogsService } from "../logs/logs.service";
import { UpdateSystemConfigDto } from "./dto/system-config.dto";

const MAX_PDF_SIZE_KEY = "max_pdf_size_mb";
const MAX_PDF_IMAGES_KEY = "max_pdf_images";
const SYSTEM_VERSION_KEY = "system_version";
const DEFAULT_MAX_PDF_SIZE = 10;
const DEFAULT_MAX_PDF_IMAGES = 20;
const DEFAULT_SYSTEM_VERSION = "1.0.0";

@Injectable()
export class SystemService {
  constructor(
    private prisma: PrismaService,
    private logs: LogsService,
  ) {}

  async getConfig(): Promise<{
    maxPdfSizeMb: number;
    maxPdfImages: number;
    systemVersion: string;
  }> {
    const settings = await this.prisma.setting.findMany({
      where: { key: { in: [MAX_PDF_SIZE_KEY, MAX_PDF_IMAGES_KEY, SYSTEM_VERSION_KEY] } },
    });

    const byKey = Object.fromEntries(settings.map((s) => [s.key, s.value]));

    return {
      maxPdfSizeMb: byKey[MAX_PDF_SIZE_KEY]
        ? parseInt(byKey[MAX_PDF_SIZE_KEY], 10)
        : DEFAULT_MAX_PDF_SIZE,
      maxPdfImages: byKey[MAX_PDF_IMAGES_KEY]
        ? parseInt(byKey[MAX_PDF_IMAGES_KEY], 10)
        : DEFAULT_MAX_PDF_IMAGES,
      systemVersion: byKey[SYSTEM_VERSION_KEY] ?? DEFAULT_SYSTEM_VERSION,
    };
  }

  async updateConfig(
    dto: UpdateSystemConfigDto,
    requesterId: string,
    ip: string,
  ): Promise<{ maxPdfSizeMb: number; maxPdfImages: number; systemVersion: string }> {
    const ops: Promise<any>[] = [];

    if (dto.maxPdfSizeMb !== undefined) {
      ops.push(
        this.prisma.setting.upsert({
          where: { key: MAX_PDF_SIZE_KEY },
          update: { value: String(dto.maxPdfSizeMb) },
          create: {
            key: MAX_PDF_SIZE_KEY,
            value: String(dto.maxPdfSizeMb),
            label: "Tamaño máximo de PDF (MB)",
          },
        }),
      );
    }

    if (dto.maxPdfImages !== undefined) {
      ops.push(
        this.prisma.setting.upsert({
          where: { key: MAX_PDF_IMAGES_KEY },
          update: { value: String(dto.maxPdfImages) },
          create: {
            key: MAX_PDF_IMAGES_KEY,
            value: String(dto.maxPdfImages),
            label: "Máximo de imágenes por PDF generado",
          },
        }),
      );
    }

    if (dto.systemVersion !== undefined) {
      ops.push(
        this.prisma.setting.upsert({
          where: { key: SYSTEM_VERSION_KEY },
          update: { value: dto.systemVersion },
          create: {
            key: SYSTEM_VERSION_KEY,
            value: dto.systemVersion,
            label: "Versión del sistema",
          },
        }),
      );
    }

    await Promise.all(ops);

    await this.logs.log({
      userId: requesterId,
      action: "UPDATE_SYSTEM_CONFIG",
      resource: "system",
      details: dto,
      ip,
    });

    return this.getConfig();
  }
}
