import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { LogsService } from "../logs/logs.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { CreatePermissionDto } from "./dto/create-permission.dto";
import { UpdatePermissionDto } from "./dto/update-permission.dto";
import {
  getPrismaSkipTake,
  paginate,
} from "../../common/utils/pagination.util";

@Injectable()
export class PermissionsService {
  constructor(
    private prisma: PrismaService,
    private logs: LogsService,
    private realtime: RealtimeGateway,
  ) {}

  /**
   * Real-time UI hint a todos los usuarios que tienen el rol afectado: recarguen
   * permisos (GET /auth/me). NO es autorización — los guards leen de DB en cada
   * request. `emitToUser` es no-op si el usuario no está conectado.
   */
  private async notifyRoleMembers(roleId: string, reason: string): Promise<void> {
    const members = await this.prisma.userRole.findMany({
      where: { roleId },
      select: { userId: true },
    });
    const updatedAt = new Date().toISOString();
    for (const { userId } of members) {
      this.realtime.emitToUser(userId, "permissions:updated", {
        userId,
        reason,
        updatedAt,
      });
    }
  }

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

    const perm = await this.prisma.permission.create({ data: dto });
    await this.logs.log({
      userId: requesterId,
      action: "CREATE_PERMISSION",
      resource: "permissions",
      resourceId: perm.id,
      ip,
    });
    return perm;
  }

  async update(
    id: string,
    dto: UpdatePermissionDto,
    requesterId: string,
    ip: string,
  ) {
    const existing = await this.prisma.permission.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Permiso no encontrado");

    const perm = await this.prisma.permission.update({
      where: { id },
      data: dto,
    });
    await this.logs.log({
      userId: requesterId,
      action: "UPDATE_PERMISSION",
      resource: "permissions",
      resourceId: id,
      ip,
    });
    return perm;
  }

  async remove(id: string, requesterId: string, ip: string) {
    const existing = await this.prisma.permission.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Permiso no encontrado");

    await this.prisma.permission.delete({ where: { id } });
    await this.logs.log({
      userId: requesterId,
      action: "DELETE_PERMISSION",
      resource: "permissions",
      resourceId: id,
      ip,
    });
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
    await this.logs.log({
      userId: requesterId,
      action: "GRANT_PERMISSION",
      resource: "permissions",
      details: { roleId, permissionId },
      ip,
    });

    await this.notifyRoleMembers(roleId, "permission_granted");

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
    await this.logs.log({
      userId: requesterId,
      action: "REVOKE_PERMISSION",
      resource: "permissions",
      details: { roleId, permissionId },
      ip,
    });

    await this.notifyRoleMembers(roleId, "permission_revoked");

    return { message: "Permiso revocado correctamente" };
  }
}
