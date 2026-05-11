import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { LogsService } from "../logs/logs.service";
import { UpdateSystemConfigDto } from "./dto/system-config.dto";

const MAX_PDF_SIZE_KEY = "max_pdf_size_mb";
const DEFAULT_MAX_PDF_SIZE = 10;

@Injectable()
export class SystemService {
  constructor(
    private prisma: PrismaService,
    private logs: LogsService,
  ) {}

  async getConfig(): Promise<{ maxPdfSizeMb: number }> {
    const setting = await this.prisma.setting.findUnique({
      where: { key: MAX_PDF_SIZE_KEY },
    });

    const maxPdfSizeMb = setting
      ? parseInt(setting.value, 10)
      : DEFAULT_MAX_PDF_SIZE;

    return { maxPdfSizeMb };
  }

  async updateConfig(
    dto: UpdateSystemConfigDto,
    requesterId: string,
    ip: string,
  ): Promise<{ maxPdfSizeMb: number }> {
    await this.prisma.setting.upsert({
      where: { key: MAX_PDF_SIZE_KEY },
      update: { value: String(dto.maxPdfSizeMb) },
      create: {
        key: MAX_PDF_SIZE_KEY,
        value: String(dto.maxPdfSizeMb),
        label: "Tamaño máximo de PDF (MB)",
      },
    });

    await this.logs.log({
      userId: requesterId,
      action: "UPDATE_SYSTEM_CONFIG",
      resource: "system",
      details: { maxPdfSizeMb: dto.maxPdfSizeMb },
      ip,
    });

    return { maxPdfSizeMb: dto.maxPdfSizeMb };
  }
}
