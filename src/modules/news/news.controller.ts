import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  PayloadTooLargeException,
  Post,
  Query,
  UnsupportedMediaTypeException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import { memoryStorage } from "multer";
import { RoleType } from "@prisma/client";
import { NewsService } from "./news.service";
import { CreateNewsDto } from "./dto/create-news.dto";
import { UpdateNewsDto } from "./dto/update-news.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { RequireRoles } from "../../common/decorators/roles.decorator";

// 5MB for news images — balanced limit for web-quality photos
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

// Magic byte signatures for image types
function hasValidImageMagic(buf: Buffer, mime: string): boolean {
  if (mime === "image/jpeg") {
    return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  if (mime === "image/png") {
    return (
      buf.length >= 8 &&
      buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
      buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
    );
  }
  if (mime === "image/webp") {
    // RIFF....WEBP
    return (
      buf.length >= 12 &&
      buf.slice(0, 4).toString("binary") === "RIFF" &&
      buf.slice(8, 12).toString("binary") === "WEBP"
    );
  }
  return false;
}

@ApiTags("News")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("news")
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  @SkipThrottle()
  @ApiOperation({ summary: "Listar noticias paginadas" })
  @ApiQuery({ name: "page", required: false, example: 1 })
  @ApiQuery({ name: "limit", required: false, example: 20 })
  findAll(
    @Query("page", new ParseIntPipe({ optional: true })) page = 1,
    @Query("limit", new ParseIntPipe({ optional: true })) limit = 20,
  ) {
    // Clamp to safe ranges regardless of what ParseIntPipe passes through
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    return this.newsService.findAll({ page: safePage, limit: safeLimit });
  }

  @Get(":id")
  @SkipThrottle()
  @ApiOperation({ summary: "Obtener noticia por ID" })
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.newsService.findOne(id);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @RequireRoles(RoleType.SUPER_ADMIN, RoleType.NOTARIO)
  @Throttle({ short: { limit: 15, ttl: 60_000 } })
  @ApiOperation({ summary: "Actualizar noticia con imagen opcional (máx. 5MB)" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({ type: UpdateNewsDto })
  @UseInterceptors(
    FileInterceptor("image", {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
    }),
  )
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateNewsDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    if (image) {
      if (!(ALLOWED_MIME as readonly string[]).includes(image.mimetype)) {
        throw new UnsupportedMediaTypeException(
          `Tipo de archivo no permitido. Usa: ${ALLOWED_MIME.join(", ")}`,
        );
      }
      if (image.size > MAX_IMAGE_BYTES) {
        throw new PayloadTooLargeException(
          `La imagen supera el límite de ${MAX_IMAGE_BYTES / 1024 / 1024} MB`,
        );
      }
      if (!hasValidImageMagic(image.buffer, image.mimetype)) {
        throw new BadRequestException(
          "El contenido del archivo no corresponde al tipo de imagen declarado",
        );
      }
    }
    return this.newsService.update(id, dto, image);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @RequireRoles(RoleType.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Eliminar noticia (SUPER_ADMIN)" })
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.newsService.remove(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @RequireRoles(RoleType.SUPER_ADMIN, RoleType.NOTARIO)
  @HttpCode(HttpStatus.CREATED)
  // 5 news posts/min — news creation is infrequent; prevents memory exhaustion via uploads
  @Throttle({ short: { limit: 15, ttl: 60_000 } })
  @ApiOperation({ summary: "Crear noticia con imagen opcional (máx. 5MB)" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({ type: CreateNewsDto })
  @UseInterceptors(
    FileInterceptor("image", {
      storage: memoryStorage(),
      limits: {
        // Hard Multer cap: rejects before fully loading into memory
        fileSize: MAX_IMAGE_BYTES,
        files: 1,
      },
    }),
  )
  async create(
    @Body() dto: CreateNewsDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    if (image) {
      if (!(ALLOWED_MIME as readonly string[]).includes(image.mimetype)) {
        throw new UnsupportedMediaTypeException(
          `Tipo de archivo no permitido. Usa: ${ALLOWED_MIME.join(", ")}`,
        );
      }

      if (image.size > MAX_IMAGE_BYTES) {
        throw new PayloadTooLargeException(
          `La imagen supera el límite de ${MAX_IMAGE_BYTES / 1024 / 1024} MB`,
        );
      }

      // Magic bytes: verify actual file content matches declared MIME
      if (!hasValidImageMagic(image.buffer, image.mimetype)) {
        throw new BadRequestException(
          "El contenido del archivo no corresponde al tipo de imagen declarado",
        );
      }
    }

    return this.newsService.create(dto, image);
  }
}
