import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { SettingsService } from "./settings.service";
import {
  BulkUpdateSettingsDto,
  UpdateSettingDto,
} from "./dto/update-setting.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";

@ApiTags("Settings")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("settings")
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @RequirePermissions("settings:read")
  @ApiOperation({ summary: "Obtener todas las configuraciones del sistema" })
  findAll() {
    return this.settingsService.findAll();
  }

  @Get(":key")
  @RequirePermissions("settings:read")
  @ApiOperation({ summary: "Obtener configuración por clave" })
  findOne(@Param("key") key: string) {
    return this.settingsService.findOne(key);
  }

  @Patch(":key")
  @RequirePermissions("settings:update")
  @ApiOperation({ summary: "Actualizar configuración por clave" })
  update(
    @Param("key") key: string,
    @Body() dto: UpdateSettingDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.settingsService.update(key, dto, user.sub, req.ip || "");
  }

  @Patch()
  @RequirePermissions("settings:update")
  @ApiOperation({ summary: "Actualizar múltiples configuraciones" })
  bulkUpdate(
    @Body() dto: BulkUpdateSettingsDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.settingsService.bulkUpdate(dto, user.sub, req.ip || "");
  }
}
