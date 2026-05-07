import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe,
  Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/utils/pagination.util';

@ApiTags('Permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @RequirePermissions('permissions:read')
  @ApiOperation({ summary: 'Listar permisos' })
  findAll(@Query() pagination: PaginationDto) {
    return this.permissionsService.findAll(pagination.page, pagination.limit);
  }

  @Get(':id')
  @RequirePermissions('permissions:read')
  @ApiOperation({ summary: 'Obtener permiso por ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.permissionsService.findOne(id);
  }

  @Post()
  @RequirePermissions('permissions:create')
  @ApiOperation({ summary: 'Crear permiso' })
  create(@Body() dto: CreatePermissionDto, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.permissionsService.create(dto, user.sub, req.ip || '');
  }

  @Patch(':id')
  @RequirePermissions('permissions:update')
  @ApiOperation({ summary: 'Actualizar permiso' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePermissionDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.permissionsService.update(id, dto, user.sub, req.ip || '');
  }

  @Delete(':id')
  @RequirePermissions('permissions:delete')
  @ApiOperation({ summary: 'Eliminar permiso' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    return this.permissionsService.remove(id, user.sub, req.ip || '');
  }

  @Post(':permissionId/grant/:roleId')
  @RequirePermissions('permissions:grant')
  @ApiOperation({ summary: 'Otorgar permiso a rol' })
  grant(
    @Param('permissionId', ParseUUIDPipe) permissionId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.permissionsService.grantToRole(roleId, permissionId, user.sub, req.ip || '');
  }

  @Delete(':permissionId/revoke/:roleId')
  @RequirePermissions('permissions:grant')
  @ApiOperation({ summary: 'Revocar permiso de rol' })
  revoke(
    @Param('permissionId', ParseUUIDPipe) permissionId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    return this.permissionsService.revokeFromRole(roleId, permissionId, user.sub, req.ip || '');
  }
}
