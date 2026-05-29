import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PDFDocument } from "pdf-lib";
import { PrismaService } from "../../prisma/prisma.service";
import { LogsService } from "../logs/logs.service";
import { S3Service } from "../../common/s3/s3.service";
import {
  ArchiveType,
  BeneficiaryDto,
  CreateArchiveDto,
  GrantorDto,
} from "./dto/create-archive.dto";
import { UpdateArchiveDto } from "./dto/update-archive.dto";
import {
  getPrismaSkipTake,
  paginate,
} from "../../common/utils/pagination.util";
import { validateIdentificacion } from "../../common/utils/identification.helper";

const ARCHIVE_INCLUDE = {
  createdBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  updatedBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  grantors: true,
  beneficiaries: true,
};

function mapParticipant(p: GrantorDto | BeneficiaryDto) {
  return {
    nombresCompletos: p.nombresCompletos,
    cedulaORuc: p.es_pasaporte
      ? (p.pasaporte as string)
      : (p.cedulaORuc as string),
    nacionalidad: p.nacionalidad,
  };
}

function validateParticipants(
  grantors: GrantorDto[],
  beneficiaries: BeneficiaryDto[],
): void {
  for (const g of grantors ?? []) {
    const result = validateIdentificacion({
      cedulaORuc: g.cedulaORuc,
      esPasaporte: g.es_pasaporte,
      pasaporte: g.pasaporte,
    });
    if (!result.valid) throw new BadRequestException(result.error);
  }
  for (const b of beneficiaries ?? []) {
    const result = validateIdentificacion({
      cedulaORuc: b.cedulaORuc,
      esPasaporte: b.es_pasaporte,
      pasaporte: b.pasaporte,
    });
    if (!result.valid) throw new BadRequestException(result.error);
  }
}

@Injectable()
export class ArchivesService {
  private readonly logger = new Logger(ArchivesService.name);

  constructor(
    private prisma: PrismaService,
    private logs: LogsService,
    private s3: S3Service,
  ) {}

  async findAll(page = 1, limit = 20, search?: string, type?: ArchiveType) {
    const where: any = { deletedAt: null };

    if (type) where.type = type;

    if (search) {
      where.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { observations: { contains: search, mode: "insensitive" } },
        {
          grantors: {
            some: {
              nombresCompletos: { contains: search, mode: "insensitive" },
            },
          },
        },
        { grantors: { some: { cedulaORuc: { contains: search } } } },
        {
          beneficiaries: {
            some: {
              nombresCompletos: { contains: search, mode: "insensitive" },
            },
          },
        },
        { beneficiaries: { some: { cedulaORuc: { contains: search } } } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.archive.findMany({
        where,
        include: ARCHIVE_INCLUDE,
        ...getPrismaSkipTake(page, limit),
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.archive.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findOne(id: string) {
    const archive = await this.prisma.archive.findFirst({
      where: { id, deletedAt: null },
      include: ARCHIVE_INCLUDE,
    });
    if (!archive) throw new NotFoundException("Archivo no encontrado");
    return archive;
  }

  async create(dto: CreateArchiveDto, userId: string, ip: string) {
    const existing = await this.prisma.archive.findFirst({
      where: { code: dto.code, deletedAt: null },
    });
    if (existing)
      throw new BadRequestException(`El código "${dto.code}" ya está en uso`);

    validateParticipants(dto.grantors ?? [], dto.beneficiaries ?? []);

    const archive = await this.prisma.archive.create({
      data: {
        code: dto.code,
        type: dto.type,
        observations: dto.observations,
        documentDate: dto.documentDate ? new Date(dto.documentDate) : undefined,
        createdById: userId,
        grantors: {
          create: (dto.grantors ?? []).map(mapParticipant),
        },
        beneficiaries: {
          create: (dto.beneficiaries ?? []).map(mapParticipant),
        },
      },
      include: ARCHIVE_INCLUDE,
    });

    await this.logs.log({
      userId,
      action: "CREATE_ARCHIVE",
      resource: "archives",
      resourceId: archive.id,
      ip,
    });
    return archive;
  }

  async update(id: string, dto: UpdateArchiveDto, userId: string, ip: string) {
    const existing = await this.prisma.archive.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException("Archivo no encontrado");

    if (dto.code && dto.code !== existing.code) {
      const codeConflict = await this.prisma.archive.findFirst({
        where: { code: dto.code, deletedAt: null, id: { not: id } },
      });
      if (codeConflict)
        throw new BadRequestException(`El código "${dto.code}" ya está en uso`);
    }

    if (dto.grantors !== undefined || dto.beneficiaries !== undefined) {
      validateParticipants(dto.grantors ?? [], dto.beneficiaries ?? []);
    }

    const { grantors, beneficiaries, ...archiveData } = dto;

    await this.prisma.$transaction(async (tx) => {
      if (grantors !== undefined) {
        await tx.grantor.deleteMany({ where: { archiveId: id } });
        if (grantors.length) {
          await tx.grantor.createMany({
            data: grantors.map((g) => ({
              ...mapParticipant(g),
              archiveId: id,
            })),
          });
        }
      }

      if (beneficiaries !== undefined) {
        await tx.beneficiary.deleteMany({ where: { archiveId: id } });
        if (beneficiaries.length) {
          await tx.beneficiary.createMany({
            data: beneficiaries.map((b) => ({
              ...mapParticipant(b),
              archiveId: id,
            })),
          });
        }
      }

      await tx.archive.update({
        where: { id },
        data: { ...archiveData, updatedById: userId },
      });
    });

    const updated = await this.prisma.archive.findUnique({
      where: { id },
      include: ARCHIVE_INCLUDE,
    });

    await this.logs.log({
      userId,
      action: "UPDATE_ARCHIVE",
      resource: "archives",
      resourceId: id,
      ip,
    });
    return updated;
  }

  async remove(id: string, userId: string, ip: string) {
    const archive = await this.prisma.archive.findFirst({
      where: { id, deletedAt: null },
    });
    if (!archive) throw new NotFoundException("Archivo no encontrado");

    await this.prisma.archive.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.logs.log({
      userId,
      action: "DELETE_ARCHIVE",
      resource: "archives",
      resourceId: id,
      ip,
    });

    return { message: "Archivo eliminado correctamente" };
  }

  async attachPdf(id: string, pdfUrl: string, userId: string, ip: string) {
    const archive = await this.prisma.archive.findFirst({
      where: { id, deletedAt: null },
    });
    if (!archive) throw new NotFoundException("Archivo no encontrado");

    const updated = await this.prisma.archive.update({
      where: { id },
      data: { pdfUrl, updatedById: userId },
      include: ARCHIVE_INCLUDE,
    });

    await this.logs.log({
      userId,
      action: "UPLOAD_PDF",
      resource: "archives",
      resourceId: id,
      ip,
    });
    return updated;
  }

  async generatePdf(
    id: string,
    files: Express.Multer.File[],
    userId: string,
    ip: string,
  ): Promise<{ message: string; pdfUrl: string }> {
    const archive = await this.prisma.archive.findFirst({
      where: { id, deletedAt: null },
    });
    if (!archive) throw new NotFoundException("Archivo no encontrado");

    const pdfDoc = await PDFDocument.create();

    for (const file of files) {
      const mime = file.mimetype;

      let embeddedImage: Awaited<ReturnType<typeof pdfDoc.embedJpg>>;
      try {
        embeddedImage =
          mime === "image/jpeg"
            ? await pdfDoc.embedJpg(file.buffer)
            : await pdfDoc.embedPng(file.buffer);
      } catch {
        throw new BadRequestException(
          `No se pudo procesar la imagen: ${file.originalname}. Verifica que no esté corrupta.`,
        );
      }

      const page = pdfDoc.addPage([embeddedImage.width, embeddedImage.height]);
      page.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: embeddedImage.width,
        height: embeddedImage.height,
      });
    }

    const pdfBytes = await pdfDoc.save();

    // Upload generated PDF to S3 — no local file storage
    const s3Key = await this.s3.uploadPdf(Buffer.from(pdfBytes));

    await this.prisma.archive.update({
      where: { id },
      data: { pdfUrl: s3Key, updatedById: userId },
    });

    await this.logs.log({
      userId,
      action: "GENERATE_PDF",
      resource: "archives",
      resourceId: id,
      ip,
    });

    this.logger.log(`PDF generado y subido a S3 para archivo ${id}: ${s3Key}`);

    return { message: "PDF generado correctamente", pdfUrl: s3Key };
  }
}
