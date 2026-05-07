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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ArchivesService } from './archives.service';
import { CreateArchiveDto } from './dto/create-archive.dto';
import { UpdateArchiveDto } from './dto/update-archive.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/utils/pagination.util';

const pdfStorage = diskStorage({
  destination: (req, file, cb) => cb(null, process.env.UPLOAD_DEST || './uploads'),
  filename:    (req, file, cb) => cb(null, `${uuidv4()}${extname(file.originalname)}`),
});

const pdfFilter = (req: any, file: Express.Multer.File, cb: any) => {
  if (file.mimetype !== 'application/pdf') {
    cb(new Error('Solo se permiten archivos PDF'), false);
  } else {
    cb(null, true);
  }
};

@ApiTags('Archives')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('archives')
export class ArchivesController {
  constructor(private readonly archivesService: ArchivesService) {}

  @Get()
  @RequirePermissions('archives:read')
  @ApiOperation({ summary: 'Listar archivos notariales' })
  @ApiQuery({ name: 'search', required: false, description: 'Buscar por código, otorgante, beneficiario, observaciones' })
  findAll(@Query() pagination: PaginationDto, @Query('search') search?: string) {
    return this.archivesService.findAll(pagination.page, pagination.limit, search);
  }

  @Get(':id')
  @RequirePermissions('archives:read')
  @ApiOperation({ summary: 'Obtener archivo notarial por ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.archivesService.findOne(id);
  }

  @Post()
  @RequirePermissions('archives:create')
  @ApiOperation({ summary: 'Crear archivo notarial' })
  create(@Body() dto: CreateArchiveDto, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    const ip = req.ip || req.socket.remoteAddress || '';
    return this.archivesService.create(dto, user.sub, ip);
  }

  @Patch(':id')
  @RequirePermissions('archives:update')
  @ApiOperation({ summary: 'Actualizar archivo notarial' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateArchiveDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || '';
    return this.archivesService.update(id, dto, user.sub, ip);
  }

  @Delete(':id')
  @RequirePermissions('archives:delete')
  @ApiOperation({ summary: 'Eliminar archivo notarial (soft delete)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: JwtPayload, @Req() req: Request) {
    const ip = req.ip || req.socket.remoteAddress || '';
    return this.archivesService.remove(id, user.sub, ip);
  }

  // ─── PDF UPLOAD ──────────────────────────────────────────────────────────────

  @Post(':id/upload-pdf')
  @RequirePermissions('archives:update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Subir PDF al archivo notarial' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage:  pdfStorage,
      fileFilter: pdfFilter,
      limits:   { fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10) },
    }),
  )
  async uploadPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    if (!file) throw new Error('No se proporcionó archivo PDF');
    const pdfUrl = `/uploads/${file.filename}`;
    const ip = req.ip || req.socket.remoteAddress || '';
    return this.archivesService.attachPdf(id, pdfUrl, user.sub, ip);
  }

  // ─── PDF VIEW ────────────────────────────────────────────────────────────────

  @Get(':id/pdf')
  @RequirePermissions('archives:read')
  @ApiOperation({ summary: 'Visualizar PDF del archivo notarial' })
  async viewPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const archive = await this.archivesService.findOne(id);
    if (!archive.pdfUrl) {
      return res.status(404).json({ message: 'Este archivo no tiene PDF adjunto' });
    }

    const filename = archive.pdfUrl.replace('/uploads/', '');
    const filePath = join(process.cwd(), 'uploads', filename);
    return res.sendFile(filePath);
  }
}
