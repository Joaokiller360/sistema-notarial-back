import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { RoleType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { LogsService } from "../logs/logs.service";
import { CreateRoleDto } from "./dto/create-role.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import {
  getPrismaSkipTake,
  paginate,
} from "../../common/utils/pagination.util";

const ROLE_SELECT = {
  id: true,
  name: true,
  type: true,
  description: true,
  isActive: true,
  createdAt: true,
  rolePermissions: {
    include: {
      permission: {
        select: { id: true, name: true, action: true, resource: true },
      },
    },
  },
};

// Lower index = higher authority
const ROLE_HIERARCHY = [
  RoleType.SUPER_ADMIN,
  RoleType.NOTARIO,
  RoleType.MATRIZADOR,
  RoleType.ARCHIVADOR,
];

function rankOf(roleType: string): number {
  const idx = ROLE_HIERARCHY.indexOf(roleType as RoleType);
  return idx === -1 ? ROLE_HIERARCHY.length : idx;
}

function highestRank(roles: string[]): number {
  return Math.min(...roles.map(rankOf));
}

@Injectable()
export class RolesService {
  constructor(
    private prisma: PrismaService,
    private logs: LogsService,
  ) {}

  async findAll(page = 1, limit = 20) {
    const where = { deletedAt: null };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.role.findMany({
        where,
        select: ROLE_SELECT,
        ...getPrismaSkipTake(page, limit),
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.role.count({ where }),
    ]);
    return paginate(data, total, page, limit);
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, deletedAt: null },
      select: ROLE_SELECT,
    });
    if (!role) throw new NotFoundException("Rol no encontrado");
    return role;
  }

  async create(dto: CreateRoleDto, requesterId: string, ip: string) {
    const existing = await this.prisma.role.findFirst({
      where: { name: dto.name, deletedAt: null },
    });
    if (existing)
      throw new BadRequestException("Ya existe un rol con ese nombre");

    const role = await this.prisma.role.create({
      data: {
        name: dto.name,
        type: dto.type,
        description: dto.description,
        ...(dto.permissionIds?.length && {
          rolePermissions: {
            create: dto.permissionIds.map((permissionId) => ({ permissionId })),
          },
        }),
      },
      select: ROLE_SELECT,
    });

    await this.logs.log({
      userId: requesterId,
      action: "CREATE_ROLE",
      resource: "roles",
      resourceId: role.id,
      ip,
    });
    return role;
  }

  async update(
    id: string,
    dto: UpdateRoleDto,
    requesterId: string,
    ip: string,
  ) {
    const existing = await this.prisma.role.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException("Rol no encontrado");

    if (dto.permissionIds !== undefined) {
      await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
      if (dto.permissionIds.length) {
        await this.prisma.rolePermission.createMany({
          data: dto.permissionIds.map((permissionId) => ({
            roleId: id,
            permissionId,
          })),
          skipDuplicates: true,
        });
      }
    }

    const { permissionIds: _, ...updateData } = dto;
    const role = await this.prisma.role.update({
      where: { id },
      data: updateData,
      select: ROLE_SELECT,
    });

    await this.logs.log({
      userId: requesterId,
      action: "UPDATE_ROLE",
      resource: "roles",
      resourceId: id,
      ip,
    });
    return role;
  }

  async remove(id: string, requesterId: string, ip: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, deletedAt: null },
    });
    if (!role) throw new NotFoundException("Rol no encontrado");

    const usersWithRole = await this.prisma.userRole.count({
      where: { roleId: id },
    });
    if (usersWithRole > 0) {
      throw new BadRequestException(
        `No se puede eliminar: ${usersWithRole} usuario(s) tienen este rol asignado`,
      );
    }

    await this.prisma.role.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.logs.log({
      userId: requesterId,
      action: "DELETE_ROLE",
      resource: "roles",
      resourceId: id,
      ip,
    });

    return { message: "Rol eliminado correctamente" };
  }

  // ─── ASSIGN / REVOKE ─────────────────────────────────────────────────────────

  async assignToUser(
    userId: string,
    roleId: string,
    requesterId: string,
    requesterRoles: string[],
    ip: string,
  ) {
    // Fetch the role to be assigned
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, deletedAt: null },
    });
    if (!role) throw new NotFoundException("Rol no encontrado");

    // Hierarchy enforcement: requester can only assign roles strictly below their rank
    // e.g., NOTARIO (rank 1) cannot assign SUPER_ADMIN (rank 0) or NOTARIO (rank 1)
    const requesterHighestRank = highestRank(requesterRoles);
    const targetRoleRank = rankOf(role.type);

    if (targetRoleRank <= requesterHighestRank) {
      throw new ForbiddenException(
        `No puede asignar el rol "${role.name}" — rango igual o superior al suyo`,
      );
    }

    // Verify target user exists and is active
    const targetUser = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!targetUser) throw new NotFoundException("Usuario no encontrado");

    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId } },
      update: {},
      create: { userId, roleId },
    });

    await this.logs.log({
      userId: requesterId,
      action: "ASSIGN_ROLE",
      resource: "roles",
      resourceId: roleId,
      details: { userId, roleName: role.name },
      ip,
    });
    return { message: "Rol asignado correctamente" };
  }

  async revokeFromUser(
    userId: string,
    roleId: string,
    requesterId: string,
    requesterRoles: string[],
    ip: string,
  ) {
    // Fetch the role to be revoked
    const role = await this.prisma.role.findFirst({
      where: { id: roleId },
    });
    if (!role) throw new NotFoundException("Rol no encontrado");

    // Hierarchy enforcement: same rule as assign — can only revoke roles below your rank
    const requesterHighestRank = highestRank(requesterRoles);
    const targetRoleRank = rankOf(role.type);

    if (targetRoleRank <= requesterHighestRank) {
      throw new ForbiddenException(
        `No puede revocar el rol "${role.name}" — rango igual o superior al suyo`,
      );
    }

    await this.prisma.userRole.deleteMany({ where: { userId, roleId } });

    await this.logs.log({
      userId: requesterId,
      action: "REVOKE_ROLE",
      resource: "roles",
      resourceId: roleId,
      details: { userId, roleName: role.name },
      ip,
    });
    return { message: "Rol revocado correctamente" };
  }
}
