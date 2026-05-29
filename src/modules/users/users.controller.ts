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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { Request } from "express";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { ProtectSuperAdminGuard } from "../../common/guards/protect-super-admin.guard";
import { NotarioRestrictionGuard } from "../../common/guards/notario-restriction.guard";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { PaginationDto } from "../../common/utils/pagination.util";

@ApiTags("Users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @SkipThrottle()
  @RequirePermissions("users:read")
  @ApiOperation({ summary: "Listar usuarios" })
  @ApiQuery({ name: "search", required: false })
  findAll(
    @Query() pagination: PaginationDto,
    @Query("search") search?: string,
  ) {
    return this.usersService.findAll(pagination.page, pagination.limit, search);
  }

  @Get(":id")
  @SkipThrottle()
  @RequirePermissions("users:read")
  @ApiOperation({ summary: "Obtener usuario por ID" })
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  @RequirePermissions("users:create")
  @ApiOperation({ summary: "Crear nuevo usuario" })
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || "";
    return this.usersService.create(dto, user, ip);
  }

  @Patch(":id")
  @RequirePermissions("users:update")
  // Blocks NOTARIO from modifying a Super Admin account
  @UseGuards(NotarioRestrictionGuard)
  @ApiOperation({ summary: "Actualizar usuario" })
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || "";
    return this.usersService.update(id, dto, user, ip);
  }

  @Delete(":id")
  @RequirePermissions("users:delete")
  // Blocks ANY role from deleting a Super Admin; also blocks NOTARIO specifically
  @UseGuards(ProtectSuperAdminGuard, NotarioRestrictionGuard)
  @ApiOperation({ summary: "Eliminar usuario (soft delete)" })
  remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || "";
    return this.usersService.remove(id, user.sub, ip);
  }
}
