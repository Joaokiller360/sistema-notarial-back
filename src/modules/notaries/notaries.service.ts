import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateNotaryDto } from "./dto/create-notary.dto";
import { UpdateNotaryDto } from "./dto/update-notary.dto";

@Injectable()
export class NotariesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateNotaryDto) {
    const existing = await this.prisma.notary.findUnique({
      where: { notaryNumber: dto.notaryNumber },
    });
    if (existing) {
      throw new ConflictException(
        `Ya existe una notaría con el número ${dto.notaryNumber}`,
      );
    }

    return this.prisma.notary.create({ data: dto });
  }

  findAll() {
    return this.prisma.notary.findMany({ orderBy: { notaryNumber: "asc" } });
  }

  async findOne(id: number) {
    const notary = await this.prisma.notary.findUnique({ where: { id } });
    if (!notary) throw new NotFoundException("Notaría no encontrada");
    return notary;
  }

  async update(id: number, dto: UpdateNotaryDto) {
    await this.findOne(id);

    if (dto.notaryNumber !== undefined) {
      const conflict = await this.prisma.notary.findFirst({
        where: { notaryNumber: dto.notaryNumber, id: { not: id } },
      });
      if (conflict) {
        throw new ConflictException(
          `Ya existe una notaría con el número ${dto.notaryNumber}`,
        );
      }
    }

    return this.prisma.notary.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.notary.delete({ where: { id } });
    return { message: "Notaría eliminada correctamente" };
  }
}
