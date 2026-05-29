import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { Request } from "express";
import { ClientsService } from "./clients.service";
import { BulkCreateClientsDto, CreateClientDto } from "./dto/create-client.dto";
import { UpdateClientDto } from "./dto/update-client.dto";
import { GetClientsDto } from "./dto/get-clients.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";

@ApiTags("Clients")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("clients")
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @SkipThrottle()
  @RequirePermissions("clients:read")
  @ApiOperation({ summary: "Buscar clientes por nombre o cédula/RUC" })
  findAll(@Query() dto: GetClientsDto) {
    return this.clientsService.findAll(dto.search, dto.page, dto.limit);
  }

  @Get(":id")
  @SkipThrottle()
  @RequirePermissions("clients:read")
  @ApiOperation({ summary: "Obtener cliente por ID" })
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.clientsService.findOne(id);
  }

  @Patch(":id")
  @RequirePermissions("clients:update")
  @ApiOperation({ summary: "Actualizar cliente" })
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || "";
    return this.clientsService.update(id, dto, user.sub, ip);
  }

  @Delete(":id")
  @RequirePermissions("clients:delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Eliminar cliente" })
  remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || "";
    return this.clientsService.remove(id, user.sub, ip);
  }

  @Post()
  @RequirePermissions("clients:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Crear un cliente individual" })
  @ApiResponse({ status: 201, description: "Cliente creado exitosamente" })
  @ApiResponse({ status: 400, description: "Datos inválidos" })
  create(
    @Body() dto: CreateClientDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || "";
    return this.clientsService.create(dto, user.sub, ip);
  }

  @Post("bulk")
  @RequirePermissions("clients:create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Importar múltiples clientes en una sola operación" })
  @ApiBody({ type: BulkCreateClientsDto })
  @ApiResponse({
    status: 201,
    description: "Clientes importados exitosamente",
    schema: { example: { created: 150 } },
  })
  @ApiResponse({ status: 400, description: "Datos inválidos" })
  bulkCreate(
    @Body() dto: BulkCreateClientsDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || "";
    return this.clientsService.bulkCreate(dto, user.sub, ip);
  }
}
