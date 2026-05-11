import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { extname } from "path";
import { v4 as uuidv4 } from "uuid";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { S3Service } from "../../common/s3/s3.service";
import { UploadUrlDto } from "./dto/upload-url.dto";

@ApiTags("Files")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("files")
export class FilesController {
  constructor(private readonly s3: S3Service) {}

  @Post("upload-url")
  @ApiOperation({
    summary: "Generar presigned URL para subir un archivo a S3",
    description:
      "Retorna una URL PUT pre-firmada válida por 10 minutos. El cliente debe hacer PUT directamente a esa URL con el archivo en el body y el header Content-Type correcto.",
  })
  @ApiResponse({
    status: 201,
    schema: {
      example: {
        uploadUrl: "https://sistema-notaria.s3.amazonaws.com/...",
        key: "uploads/2026/05/uuid.pdf",
        expiresIn: 600,
      },
    },
  })
  async getUploadUrl(@Body() dto: UploadUrlDto) {
    const ext = extname(dto.filename) || "";
    const key = `uploads/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, "0")}/${uuidv4()}${ext}`;
    const uploadUrl = await this.s3.getPresignedUploadUrl(
      key,
      dto.contentType,
      600,
    );
    return { uploadUrl, key, expiresIn: 600 };
  }

  @Get("view-url")
  @ApiOperation({
    summary: "Generar presigned URL para ver/descargar un archivo de S3",
    description: "Retorna una URL GET pre-firmada válida por 1 hora.",
  })
  @ApiQuery({
    name: "key",
    required: true,
    example: "uploads/2026/05/uuid.pdf",
    description: "Key del archivo en S3",
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        viewUrl: "https://sistema-notaria.s3.amazonaws.com/...",
        expiresIn: 3600,
      },
    },
  })
  async getViewUrl(@Query("key") key: string) {
    const viewUrl = await this.s3.getSignedUrl(key, 3600);
    return { viewUrl, expiresIn: 3600 };
  }
}
