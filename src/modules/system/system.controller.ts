import { Body, Controller, Get, Patch, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RoleType } from "@prisma/client";
import { Request } from "express";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { RequireRoles } from "../../common/decorators/roles.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { SystemService } from "./system.service";
import { UpdateSystemConfigDto } from "./dto/system-config.dto";

@ApiTags("System")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireRoles(RoleType.SUPER_ADMIN)
@Controller("system")
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get("config")
  @ApiOperation({ summary: "Obtener configuración del sistema" })
  getConfig() {
    return this.systemService.getConfig();
  }

  @Patch("config")
  @ApiOperation({ summary: "Actualizar configuración del sistema" })
  updateConfig(
    @Body() dto: UpdateSystemConfigDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.systemService.updateConfig(dto, user.sub, req.ip || "");
  }
}
