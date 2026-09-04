import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";

import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import { Request, Response } from "express";
import { memoryStorage } from "multer";
import { ArchivesService } from "./archives.service";
import { CreateArchiveDto } from "./dto/create-archive.dto";
import { UpdateArchiveDto } from "./dto/update-archive.dto";
import { GetArchivesDto } from "./dto/get-archives.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { S3Service } from "../../common/s3/s3.service";
import { SystemService } from "../system/system.service";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

/** Hard Multer limit for PDF uploads — 25MB. Applied before file reaches memory. */
const PDF_MULTER_LIMIT_BYTES = 25 * 1024 * 1024;

/** Hard Multer limit per image for PDF generation — 5MB each. */
const IMAGE_MULTER_LIMIT_BYTES = 5 * 1024 * 1024;

/** Hard Multer cap on number of images per PDF generation request. */
const IMAGE_MULTER_MAX_COUNT = 20;

// ─── FILTERS ─────────────────────────────────────────────────────────────────

/**
 * Multer fileFilter for PDF uploads.
 * Checks the client-supplied Content-Type as a first gate.
 * Magic bytes are validated in the handler after the buffer is available.
 */
const pdfFilter = (req: any, file: Express.Multer.File, cb: any) => {
  if (file.mimetype !== "application/pdf") {
    return cb(new BadRequestException("Solo se permiten archivos PDF"), false);
  }
  cb(null, true);
};

/**
 * Multer fileFilter for images used in PDF generation.
 * Allows only image/jpeg and image/png.
 */
const imageFilter = (req: any, file: Express.Multer.File, cb: any) => {
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

// ─── MAGIC BYTES HELPERS ──────────────────────────────────────────────────────

function isPdf(buf: Buffer): boolean {
  return buf.length >= 4 && buf.slice(0, 4).toString("binary") === "%PDF";
}

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

// ─── CONTROLLER ───────────────────────────────────────────────────────────────

@ApiTags("Archives")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller("archives")
export class ArchivesController {
  constructor(
    private readonly archivesService: ArchivesService,
    private readonly s3Service: S3Service,
    private readonly systemService: SystemService,
  ) {}

  @Get()
  @RequirePermissions("archives:read")
  @SkipThrottle()
  @ApiOperation({ summary: "Listar archivos notariales" })
  findAll(@Query() query: GetArchivesDto) {
    return this.archivesService.findAll(
      query.page,
      query.limit,
      query.search,
      query.type,
    );
  }

  @Get(":id")
  @RequirePermissions("archives:read")
  @SkipThrottle()
  @ApiOperation({ summary: "Obtener archivo notarial por ID" })
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.archivesService.findOne(id);
  }

  @Post()
  @RequirePermissions("archives:create")
  @ApiOperation({ summary: "Crear archivo notarial" })
  create(
    @Body() dto: CreateArchiveDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || "";
    return this.archivesService.create(dto, user.sub, ip);
  }

  @Patch(":id")
  @RequirePermissions("archives:update")
  @ApiOperation({ summary: "Actualizar archivo notarial" })
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateArchiveDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || "";
    return this.archivesService.update(id, dto, user.sub, ip);
  }

  @Delete(":id")
  @RequirePermissions("archives:delete")
  @ApiOperation({ summary: "Eliminar archivo notarial (soft delete)" })
  remove(
    @Param("id", ParseUUIDPipe) id: string,
    @Body("confirmar_eliminacion") confirmBody: boolean | undefined,
    @Query("confirmar_eliminacion") confirmQuery: string | undefined,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const confirmed = confirmBody === true || confirmQuery === "true";
    if (!confirmed) {
      throw new BadRequestException({
        success: false,
        codigo: "CONFIRMACION_REQUERIDA",
        mensaje: "Debes confirmar la eliminación del archivo antes de proceder",
        campo: "confirmar_eliminacion",
      });
    }
    const ip = req.ip || (req as any).socket?.remoteAddress || "";
    return this.archivesService.remove(id, user.sub, ip);
  }

  // ─── PDF UPLOAD ──────────────────────────────────────────────────────────────

  @Post(":id/upload-pdf")
  @RequirePermissions("archives:update")
  @HttpCode(HttpStatus.OK)
  // 10 uploads/minute per IP — prevents DoS via repeated large uploads
  @Throttle({ upload: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: "Subir PDF al archivo notarial (almacenado en S3)" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { file: { type: "string", format: "binary" } },
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      fileFilter: pdfFilter,
      limits: {
        // Hard cap: Multer rejects before full buffer loads in memory
        fileSize: PDF_MULTER_LIMIT_BYTES,
        files: 1,
      },
    }),
  )
  async uploadPdf(
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException("No se proporcionó archivo PDF");

    // Magic bytes: verify actual file content is PDF (defeats MIME spoofing)
    if (!isPdf(file.buffer)) {
      throw new BadRequestException(
        "El contenido del archivo no corresponde a un PDF válido",
      );
    }

    // DB-configurable size limit (must be <= PDF_MULTER_LIMIT_BYTES)
    const { maxPdfSizeMb } = await this.systemService.getConfig();
    if (file.size > maxPdfSizeMb * 1024 * 1024) {
      throw new PayloadTooLargeException(
        `El archivo supera el límite permitido de ${maxPdfSizeMb} MB`,
      );
    }

    const s3Key = await this.s3Service.uploadPdf(file.buffer);
    const ip = req.ip || req.socket.remoteAddress || "";
    return this.archivesService.attachPdf(id, s3Key, user.sub, ip);
  }

  // ─── GENERATE PDF FROM IMAGES ────────────────────────────────────────────────

  @Post(":id/generate-pdf")
  @RequirePermissions("archives:update")
  @HttpCode(HttpStatus.OK)
  // 3 generate-pdf/minute per IP — heavy CPU/memory operation
  @Throttle({ pdf: { limit: 3, ttl: 60000 } })
  @ApiOperation({
    summary: "Generar PDF a partir de imágenes (JPG/PNG)",
    description:
      "Combina hasta 20 imágenes (5MB c/u) en un PDF. Las imágenes se procesan en orden.",
  })
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
    FilesInterceptor("images", IMAGE_MULTER_MAX_COUNT, {
      storage: memoryStorage(),
      fileFilter: imageFilter,
      limits: {
        // Hard cap per image — applied by Multer during streaming
        fileSize: IMAGE_MULTER_LIMIT_BYTES,
        // Hard cap on file count
        files: IMAGE_MULTER_MAX_COUNT,
      },
    }),
  )
  async generatePdf(
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException("No se proporcionaron imágenes");
    }

    // DB-configurable image count limit (must be <= IMAGE_MULTER_MAX_COUNT)
    const { maxPdfImages } = await this.systemService.getConfig();
    if (files.length > maxPdfImages) {
      throw new BadRequestException(
        `Se permiten máximo ${maxPdfImages} imágenes por PDF`,
      );
    }

    // Magic bytes validation for each image
    for (const file of files) {
      const validMagic =
        (file.mimetype === "image/jpeg" && isJpeg(file.buffer)) ||
        (file.mimetype === "image/png" && isPng(file.buffer));

      if (!validMagic) {
        throw new BadRequestException(
          `El archivo "${file.originalname}" no es una imagen válida`,
        );
      }
    }

    const ip = req.ip || req.socket.remoteAddress || "";
    return this.archivesService.generatePdf(id, files, user.sub, ip);
  }

  // ─── PDF VIEW ────────────────────────────────────────────────────────────────

  @Get(":id/pdf")
  @RequirePermissions("archives:read")
  @ApiOperation({ summary: "Obtener URL firmada para visualizar PDF del archivo notarial" })
  async viewPdf(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ) {
    const archive = await this.archivesService.findOne(id);
    if (!archive.pdfUrl) {
      return res
        .status(404)
        .json({ success: false, message: "Este archivo no tiene PDF adjunto" });
    }

    // S3: generate a presigned URL valid for 1 hour and redirect.
    // Restricted users get an inline disposition (view only, no forced download).
    const disposition = user.pdfDownloadDisabled ? "inline" : "attachment";
    const signedUrl = await this.s3Service.getSignedUrl(
      archive.pdfUrl,
      3600,
      disposition,
    );
    return res.redirect(signedUrl);
  }
}
