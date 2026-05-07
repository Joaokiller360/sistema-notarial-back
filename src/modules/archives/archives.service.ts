import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LogsService } from '../logs/logs.service';
import { CreateArchiveDto } from './dto/create-archive.dto';
import { UpdateArchiveDto } from './dto/update-archive.dto';
import { getPrismaSkipTake, paginate } from '../../common/utils/pagination.util';

const ARCHIVE_INCLUDE = {
  createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  updatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  grantors:      true,
  beneficiaries: true,
};

@Injectable()
export class ArchivesService {
  constructor(
    private prisma: PrismaService,
    private logs:   LogsService,
  ) {}

  async findAll(page = 1, limit = 20, search?: string) {
    const where: any = { deletedAt: null };

    if (search) {
      where.OR = [
        { code:         { contains: search, mode: 'insensitive' } },
        { observations: { contains: search, mode: 'insensitive' } },
        { grantors:      { some: { nombresCompletos: { contains: search, mode: 'insensitive' } } } },
        { grantors:      { some: { cedulaORuc:       { contains: search } } } },
        { beneficiaries: { some: { nombresCompletos: { contains: search, mode: 'insensitive' } } } },
        { beneficiaries: { some: { cedulaORuc:       { contains: search } } } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.archive.findMany({
        where,
        include: ARCHIVE_INCLUDE,
        ...getPrismaSkipTake(page, limit),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.archive.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findOne(id: string) {
    const archive = await this.prisma.archive.findFirst({
      where:   { id, deletedAt: null },
      include: ARCHIVE_INCLUDE,
    });
    if (!archive) throw new NotFoundException('Archivo no encontrado');
    return archive;
  }

  async create(dto: CreateArchiveDto, userId: string, ip: string) {
    const existing = await this.prisma.archive.findFirst({ where: { code: dto.code, deletedAt: null } });
    if (existing) throw new BadRequestException(`El código "${dto.code}" ya está en uso`);

    const archive = await this.prisma.archive.create({
      data: {
        code:         dto.code,
        observations: dto.observations,
        createdById:  userId,
        grantors: {
          create: dto.grantors,
        },
        beneficiaries: {
          create: dto.beneficiaries,
        },
      },
      include: ARCHIVE_INCLUDE,
    });

    await this.logs.log({ userId, action: 'CREATE_ARCHIVE', resource: 'archives', resourceId: archive.id, ip });
    return archive;
  }

  async update(id: string, dto: UpdateArchiveDto, userId: string, ip: string) {
    const existing = await this.prisma.archive.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Archivo no encontrado');

    if (dto.code && dto.code !== existing.code) {
      const codeConflict = await this.prisma.archive.findFirst({ where: { code: dto.code, deletedAt: null, id: { not: id } } });
      if (codeConflict) throw new BadRequestException(`El código "${dto.code}" ya está en uso`);
    }

    // Replace grantors and beneficiaries if provided
    const { grantors, beneficiaries, ...archiveData } = dto;

    await this.prisma.$transaction(async (tx) => {
      if (grantors !== undefined) {
        await tx.grantor.deleteMany({ where: { archiveId: id } });
        if (grantors.length) {
          await tx.grantor.createMany({ data: grantors.map((g) => ({ ...g, archiveId: id })) });
        }
      }

      if (beneficiaries !== undefined) {
        await tx.beneficiary.deleteMany({ where: { archiveId: id } });
        if (beneficiaries.length) {
          await tx.beneficiary.createMany({ data: beneficiaries.map((b) => ({ ...b, archiveId: id })) });
        }
      }

      await tx.archive.update({
        where: { id },
        data:  { ...archiveData, updatedById: userId },
      });
    });

    const updated = await this.prisma.archive.findUnique({ where: { id }, include: ARCHIVE_INCLUDE });

    await this.logs.log({ userId, action: 'UPDATE_ARCHIVE', resource: 'archives', resourceId: id, ip });
    return updated;
  }

  async remove(id: string, userId: string, ip: string) {
    const archive = await this.prisma.archive.findFirst({ where: { id, deletedAt: null } });
    if (!archive) throw new NotFoundException('Archivo no encontrado');

    await this.prisma.archive.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.logs.log({ userId, action: 'DELETE_ARCHIVE', resource: 'archives', resourceId: id, ip });

    return { message: 'Archivo eliminado correctamente' };
  }

  async attachPdf(id: string, pdfUrl: string, userId: string, ip: string) {
    const archive = await this.prisma.archive.findFirst({ where: { id, deletedAt: null } });
    if (!archive) throw new NotFoundException('Archivo no encontrado');

    const updated = await this.prisma.archive.update({
      where:   { id },
      data:    { pdfUrl, updatedById: userId },
      include: ARCHIVE_INCLUDE,
    });

    await this.logs.log({ userId, action: 'UPLOAD_PDF', resource: 'archives', resourceId: id, ip });
    return updated;
  }
}
