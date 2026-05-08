import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import {
  BulkUpdateSettingsDto,
  UpdateSettingDto,
} from "./dto/update-setting.dto";

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const settings = await this.prisma.setting.findMany({
      orderBy: { key: "asc" },
    });
    return settings.reduce(
      (acc, s) => {
        acc[s.key] = { value: s.value, label: s.label, updatedAt: s.updatedAt };
        return acc;
      },
      {} as Record<string, any>,
    );
  }

  async findOne(key: string) {
    const setting = await this.prisma.setting.findUnique({ where: { key } });
    if (!setting)
      throw new NotFoundException(`Configuración "${key}" no encontrada`);
    return setting;
  }

  async update(
    key: string,
    dto: UpdateSettingDto,
    requesterId: string,
    ip: string,
  ) {
    return this.prisma.setting.upsert({
      where: { key },
      update: { value: dto.value },
      create: { key, value: dto.value },
    });
  }

  async bulkUpdate(
    dto: BulkUpdateSettingsDto,
    requesterId: string,
    ip: string,
  ) {
    return this.prisma.$transaction(
      Object.entries(dto.settings).map(([key, value]) =>
        this.prisma.setting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        }),
      ),
    );
  }
}
