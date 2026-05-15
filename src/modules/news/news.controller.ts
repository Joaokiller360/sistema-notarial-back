import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  PayloadTooLargeException,
  Post,
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
  ApiTags,
} from "@nestjs/swagger";
import { memoryStorage } from "multer";
import { RoleType } from "@prisma/client";
import { NewsService } from "./news.service";
import { CreateNewsDto } from "./dto/create-news.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { RequireRoles } from "../../common/decorators/roles.decorator";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];

@ApiTags("News")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireRoles(RoleType.SUPER_ADMIN, RoleType.NOTARIO)
@Controller("news")
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Crear noticia con imagen opcional" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({ type: CreateNewsDto })
  @UseInterceptors(
    FileInterceptor("image", {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 }, // safety ceiling; real check below
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
        throw new PayloadTooLargeException(
          "La imagen supera el límite de 5 MB",
        );
      }
    }

    const news = await this.newsService.create(dto, image);
    return { data: news };
  }
}
