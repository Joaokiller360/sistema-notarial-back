import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { LogsService } from "../logs/logs.service";
import {
  ALLOWED_SETTING_KEYS,
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
    this.assertAllowedKey(key);
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
    this.assertAllowedKey(key);

    const setting = await this.prisma.setting.upsert({
      where: { key },
      update: { value: dto.value },
      create: { key, value: dto.value },
    });

    await this.logs.log({
      userId: requesterId,
      action: "UPDATE_SETTING",
      resource: "settings",
      // Log the key but NOT the value to avoid leaking sensitive config in audit trail
      details: { key },
      ip,
    });

    return setting;
  }

  async bulkUpdate(
    dto: BulkUpdateSettingsDto,
    requesterId: string,
    ip: string,
  ) {
    const keys = Object.keys(dto.settings);

    if (keys.length === 0) {
      throw new BadRequestException("Debe proporcionar al menos una configuración");
    }

    if (keys.length > 20) {
      throw new BadRequestException("Máximo 20 configuraciones por operación");
    }

    // Validate all keys against allowlist before any DB write
    const unknownKeys = keys.filter((k) => !ALLOWED_SETTING_KEYS.has(k));
    if (unknownKeys.length > 0) {
      throw new BadRequestException(
        `Configuraciones no permitidas: ${unknownKeys.join(", ")}`,
      );
    }

    // Validate value lengths
    const overLength = keys.filter(
      (k) => typeof dto.settings[k] !== "string" || dto.settings[k].length > 500,
    );
    if (overLength.length > 0) {
      throw new BadRequestException(
        `Valores demasiado largos en: ${overLength.join(", ")} (máx. 500 caracteres)`,
      );
    }

    const updates = await this.prisma.$transaction(
      keys.map((key) =>
        this.prisma.setting.upsert({
          where: { key },
          update: { value: dto.settings[key] },
          create: { key, value: dto.settings[key] },
        }),
      ),
    );

    await this.logs.log({
      userId: requesterId,
      action: "BULK_UPDATE_SETTINGS",
      resource: "settings",
      // Log keys only, not values
      details: { keys },
      ip,
    });

    return updates;
  }

  private assertAllowedKey(key: string): void {
    if (!key || key.length > 100 || !ALLOWED_SETTING_KEYS.has(key)) {
      throw new BadRequestException(
        `Configuración "${key}" no reconocida`,
      );
    }
  }
}
