import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { Request } from "express";
import { ClientsService } from "./clients.service";
import { BulkCreateClientsDto, CreateClientDto } from "./dto/create-client.dto";
import { PaginationDto } from "../../common/utils/pagination.util";
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
  @RequirePermissions("clients:read")
  @ApiOperation({ summary: "Buscar clientes por nombre o cédula/RUC" })
  @ApiQuery({ name: "search", required: false, description: "Nombre o cédula/RUC" })
  findAll(
    @Query() pagination: PaginationDto,
    @Query("search") search?: string,
  ) {
    return this.clientsService.findAll(search, pagination.page, pagination.limit);
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
