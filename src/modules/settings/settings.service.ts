import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { LogsService } from "../logs/logs.service";
import {
  BulkUpdateSettingsDto,
  UpdateSettingDto,
} from "./dto/update-setting.dto";

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private logs: LogsService,
  ) {}

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
    const setting = await this.prisma.setting.upsert({
      where: { key },
      update: { value: dto.value },
      create: { key, value: dto.value },
    });

    await this.logs.log({
      userId: requesterId,
      action: "UPDATE_SETTING",
      resource: "settings",
      details: { key, value: dto.value },
      ip,
    });

    return setting;
  }

  async bulkUpdate(
    dto: BulkUpdateSettingsDto,
    requesterId: string,
    ip: string,
  ) {
    const updates = await this.prisma.$transaction(
      Object.entries(dto.settings).map(([key, value]) =>
        this.prisma.setting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        }),
      ),
    );

    await this.logs.log({
      userId: requesterId,
      action: "BULK_UPDATE_SETTINGS",
      resource: "settings",
      details: { keys: Object.keys(dto.settings) },
      ip,
    });

    return updates;
  }
}
