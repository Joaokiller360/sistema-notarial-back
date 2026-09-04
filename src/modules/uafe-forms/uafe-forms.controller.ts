import {
  BadRequestException,
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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import { Request } from "express";
import { memoryStorage } from "multer";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { UafeFormsService } from "./uafe-forms.service";
import { CreateUafeFormDto } from "./dto/create-uafe-form.dto";
import { UpdateUafeFormDto } from "./dto/update-uafe-form.dto";
import { GetUafeFormsDto } from "./dto/get-uafe-forms.dto";

const COMPROBANTE_MAX_BYTES = 10 * 1024 * 1024; // 10MB antes de redimensionar
const COMPROBANTE_MAX_COUNT = 5;

function isJpeg(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}
function isPng(buf: Buffer): boolean {
  return (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  );
}

const imageFilter = (_req: any, file: Express.Multer.File, cb: any) => {
  if (!["image/jpeg", "image/png"].includes(file.mimetype)) {
    return cb(
      new BadRequestException(
        `Formato no soportado: ${file.originalname}. Solo JPG y PNG.`,
      ),
      false,
    );
  }
  cb(null, true);
};

@ApiTags("UAFE Forms")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("uafe-forms")
export class UafeFormsController {
  constructor(private readonly service: UafeFormsService) {}

  @Get()
  @SkipThrottle()
  @ApiOperation({
    summary: "Listar formularios UAFE (propios; SUPER_ADMIN / NOTARIO ven todos)",
  })
  findAll(@Query() query: GetUafeFormsDto, @CurrentUser() user: JwtPayload) {
    return this.service.findAll(user, query);
  }

  @Get(":id")
  @SkipThrottle()
  @ApiOperation({ summary: "Obtener un formulario UAFE por ID" })
  findOne(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.findOne(id, user);
  }

  @Post()
  @ApiOperation({ summary: "Crear un formulario UAFE" })
  create(
    @Body() dto: CreateUafeFormDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || "";
    return this.service.create(dto, user, ip);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Actualizar el contenido de un formulario UAFE" })
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateUafeFormDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || "";
    return this.service.update(id, dto, user, ip);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Eliminar un formulario UAFE" })
  remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || "";
    return this.service.remove(id, user, ip);
  }

  // ─── COMPROBANTES ───────────────────────────────────────────────────────────

  @Post(":id/comprobantes")
  @Throttle({ upload: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: "Subir 1–5 imágenes de comprobantes de pago (JPG/PNG)" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        images: { type: "array", items: { type: "string", format: "binary" } },
      },
    },
  })
  @UseInterceptors(
    FilesInterceptor("images", COMPROBANTE_MAX_COUNT, {
      storage: memoryStorage(),
      fileFilter: imageFilter,
      limits: { fileSize: COMPROBANTE_MAX_BYTES, files: COMPROBANTE_MAX_COUNT },
    }),
  )
  async addComprobantes(
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException("No se proporcionaron imágenes");
    }

    for (const file of files) {
      const okMagic =
        (file.mimetype === "image/jpeg" && isJpeg(file.buffer)) ||
        (file.mimetype === "image/png" && isPng(file.buffer));
      if (!okMagic) {
        throw new BadRequestException(
          `El archivo "${file.originalname}" no es una imagen JPG/PNG válida`,
        );
      }
    }

    const ip = req.ip || req.socket.remoteAddress || "";
    return this.service.addComprobantes(
      id,
      files.map((f) => ({ buffer: f.buffer, mimetype: f.mimetype })),
      user,
      ip,
    );
  }

  @Delete(":id/comprobantes/:comprobanteId")
  @ApiOperation({ summary: "Eliminar una imagen de comprobante" })
  removeComprobante(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("comprobanteId", ParseUUIDPipe) comprobanteId: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || "";
    return this.service.removeComprobante(id, comprobanteId, user, ip);
  }
}
