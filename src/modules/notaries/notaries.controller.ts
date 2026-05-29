import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { RoleType } from "@prisma/client";
import { RequireRoles } from "../../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { CreateNotaryDto } from "./dto/create-notary.dto";
import { UpdateNotaryDto } from "./dto/update-notary.dto";
import { NotariesService } from "./notaries.service";
import { PaginationDto } from "../../common/utils/pagination.util";

@ApiTags("Notaries")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("notaries")
export class NotariesController {
  constructor(private readonly notariesService: NotariesService) {}

  @Post()
  @UseGuards(RolesGuard)
  @RequireRoles(RoleType.SUPER_ADMIN, RoleType.NOTARIO)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Crear una notaría" })
  @ApiResponse({ status: 201, description: "Notaría creada correctamente" })
  @ApiResponse({ status: 409, description: "Número de notaría ya en uso" })
  create(@Body() dto: CreateNotaryDto) {
    return this.notariesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: "Listar notarías (paginado)" })
  @ApiResponse({ status: 200, description: "Lista de notarías" })
  findAll(@Query() pagination: PaginationDto) {
    return this.notariesService.findAll(pagination.page, pagination.limit);
  }

  @Get(":id")
  @ApiOperation({ summary: "Obtener una notaría por ID" })
  @ApiResponse({ status: 200, description: "Notaría encontrada" })
  @ApiResponse({ status: 404, description: "Notaría no encontrada" })
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.notariesService.findOne(id);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @RequireRoles(RoleType.SUPER_ADMIN, RoleType.NOTARIO)
  @ApiOperation({ summary: "Actualizar una notaría" })
  @ApiResponse({ status: 200, description: "Notaría actualizada" })
  @ApiResponse({ status: 404, description: "Notaría no encontrada" })
  @ApiResponse({ status: 409, description: "Número de notaría ya en uso" })
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateNotaryDto,
  ) {
    return this.notariesService.update(id, dto);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @RequireRoles(RoleType.SUPER_ADMIN)
  @ApiOperation({ summary: "Eliminar una notaría" })
  @ApiResponse({ status: 200, description: "Notaría eliminada" })
  @ApiResponse({ status: 404, description: "Notaría no encontrada" })
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.notariesService.remove(id);
  }
}
