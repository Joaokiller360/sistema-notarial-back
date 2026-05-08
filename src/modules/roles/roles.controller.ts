import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Request } from "express";
import { RolesService } from "./roles.service";
import { CreateRoleDto } from "./dto/create-role.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { PaginationDto } from "../../common/utils/pagination.util";

@ApiTags("Roles")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("roles")
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions("roles:read")
  @ApiOperation({ summary: "Listar roles" })
  findAll(@Query() pagination: PaginationDto) {
    return this.rolesService.findAll(pagination.page, pagination.limit);
  }

  @Get(":id")
  @RequirePermissions("roles:read")
  @ApiOperation({ summary: "Obtener rol por ID" })
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.rolesService.findOne(id);
  }

  @Post()
  @RequirePermissions("roles:create")
  @ApiOperation({ summary: "Crear rol" })
  create(
    @Body() dto: CreateRoleDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.rolesService.create(dto, user.sub, req.ip || "");
  }

  @Patch(":id")
  @RequirePermissions("roles:update")
  @ApiOperation({ summary: "Actualizar rol" })
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.rolesService.update(id, dto, user.sub, req.ip || "");
  }

  @Delete(":id")
  @RequirePermissions("roles:delete")
  @ApiOperation({ summary: "Eliminar rol" })
  remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.rolesService.remove(id, user.sub, req.ip || "");
  }

  @Post(":roleId/assign/:userId")
  @RequirePermissions("roles:assign")
  @ApiOperation({ summary: "Asignar rol a usuario" })
  assign(
    @Param("roleId", ParseUUIDPipe) roleId: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.rolesService.assignToUser(
      userId,
      roleId,
      user.sub,
      req.ip || "",
    );
  }

  @Delete(":roleId/revoke/:userId")
  @RequirePermissions("roles:assign")
  @ApiOperation({ summary: "Revocar rol de usuario" })
  revoke(
    @Param("roleId", ParseUUIDPipe) roleId: string,
    @Param("userId", ParseUUIDPipe) userId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.rolesService.revokeFromUser(
      userId,
      roleId,
      user.sub,
      req.ip || "",
    );
  }
}
