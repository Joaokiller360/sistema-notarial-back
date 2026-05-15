import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { memoryStorage } from "multer";
import { RoleType } from "@prisma/client";
import { NewsService } from "./news.service";
import { CreateNewsDto } from "./dto/create-news.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { RequireRoles } from "../../common/decorators/roles.decorator";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

@ApiTags("News")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("news")
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get()
  @ApiOperation({ summary: "Listar noticias paginadas" })
  @ApiQuery({ name: "page", required: false, example: 1 })
  @ApiQuery({ name: "limit", required: false, example: 50 })
  findAll(@Query("page") page = 1, @Query("limit") limit = 50) {
    return this.newsService.findAll({ page: +page, limit: +limit });
  }

  @Get(":id")
  @ApiOperation({ summary: "Obtener noticia por ID" })
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.newsService.findOne(id);
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
  @ApiOperation({ summary: "Crear noticia con imagen opcional" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({ type: CreateNewsDto })
  @UseInterceptors(
    FileInterceptor("image", {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async create(
    @Body() dto: CreateNewsDto,
    @UploadedFile() image?: Express.Multer.File,
  ) {
    if (image) {
      if (!ALLOWED_MIME.includes(image.mimetype)) {
        throw new UnsupportedMediaTypeException(
          `Tipo de archivo no permitido. Usa: ${ALLOWED_MIME.join(", ")}`,
        );
      }
      if (image.size > MAX_IMAGE_SIZE) {
        throw new PayloadTooLargeException("La imagen supera el límite de 5 MB");
      }
    }

    return this.newsService.create(dto, image);
  }
}
