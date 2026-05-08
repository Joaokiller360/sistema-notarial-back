import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreatePermissionDto } from "./dto/create-permission.dto";
import { UpdatePermissionDto } from "./dto/update-permission.dto";
import {
  getPrismaSkipTake,
  paginate,
} from "../../common/utils/pagination.util";

@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  async findAll(page = 1, limit = 50) {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.permission.findMany({
        ...getPrismaSkipTake(page, limit),
        orderBy: { resource: "asc" },
      }),
      this.prisma.permission.count(),
    ]);
    return paginate(data, total, page, limit);
  }

  async findOne(id: string) {
    const perm = await this.prisma.permission.findUnique({ where: { id } });
    if (!perm) throw new NotFoundException("Permiso no encontrado");
    return perm;
  }

  async create(dto: CreatePermissionDto, requesterId: string, ip: string) {
    const existing = await this.prisma.permission.findUnique({
      where: { name: dto.name },
    });
    if (existing) throw new BadRequestException("El permiso ya existe");

    return this.prisma.permission.create({ data: dto });
  }

  async update(
    id: string,
    dto: UpdatePermissionDto,
    requesterId: string,
    ip: string,
  ) {
    const existing = await this.prisma.permission.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Permiso no encontrado");

    return this.prisma.permission.update({ where: { id }, data: dto });
  }

  async remove(id: string, requesterId: string, ip: string) {
    const existing = await this.prisma.permission.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Permiso no encontrado");

    await this.prisma.permission.delete({ where: { id } });
    return { message: "Permiso eliminado correctamente" };
  }

  async grantToRole(
    roleId: string,
    permissionId: string,
    requesterId: string,
    ip: string,
  ) {
    await this.prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId } },
      update: {},
      create: { roleId, permissionId },
    });
    return { message: "Permiso otorgado correctamente" };
  }

  async revokeFromRole(
    roleId: string,
    permissionId: string,
    requesterId: string,
    ip: string,
  ) {
    await this.prisma.rolePermission.deleteMany({
      where: { roleId, permissionId },
    });
    return { message: "Permiso revocado correctamente" };
  }
}
