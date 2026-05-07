import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoleType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { LogsService } from '../logs/logs.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
import { getPrismaSkipTake, paginate } from '../../common/utils/pagination.util';

const USER_SELECT = {
  id:        true,
  email:     true,
  firstName: true,
  lastName:  true,
  isActive:  true,
  createdAt: true,
  updatedAt: true,
  userRoles: {
    include: {
      role: {
        select: { id: true, name: true, type: true },
      },
    },
  },
};

// Role hierarchy: lower index = higher rank
const ROLE_HIERARCHY = [RoleType.SUPER_ADMIN, RoleType.NOTARIO, RoleType.MATRIZADOR, RoleType.ARCHIVADOR];

@Injectable()
export class UsersService {
  constructor(
    private prisma:  PrismaService,
    private config:  ConfigService,
    private logs:    LogsService,
  ) {}

  async findAll(page = 1, limit = 20, search?: string) {
    const where: any = { deletedAt: null };
    if (search) {
      where.OR = [
        { email:     { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName:  { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select:  USER_SELECT,
        ...getPrismaSkipTake(page, limit),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where:  { id, deletedAt: null },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async create(dto: CreateUserDto, requester: JwtPayload, ip: string) {
    // NOTARIO can only create MATRIZADOR and ARCHIVADOR
    if (!requester.roles.includes(RoleType.SUPER_ADMIN) && dto.roleIds?.length) {
      await this.validateRoleCreationPermission(dto.roleIds, requester.roles);
    }

    const exists = await this.prisma.user.findFirst({ where: { email: dto.email, deletedAt: null } });
    if (exists) throw new BadRequestException('El email ya está registrado');

    const hashed = await bcrypt.hash(dto.password, this.config.get<number>('jwt.bcryptRounds')!);

    const user = await this.prisma.user.create({
      data: {
        email:     dto.email,
        password:  hashed,
        firstName: dto.firstName,
        lastName:  dto.lastName,
        isActive:  dto.isActive ?? true,
        ...(dto.roleIds?.length && {
          userRoles: {
            create: dto.roleIds.map((roleId) => ({ roleId })),
          },
        }),
      },
      select: USER_SELECT,
    });

    await this.logs.log({
      userId:     requester.sub,
      action:     'CREATE_USER',
      resource:   'users',
      resourceId: user.id,
      ip,
    });

    return user;
  }

  async update(id: string, dto: UpdateUserDto, requester: JwtPayload, ip: string) {
    const existing = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('Usuario no encontrado');

    if (dto.roleIds?.length) {
      if (!requester.roles.includes(RoleType.SUPER_ADMIN)) {
        await this.validateRoleCreationPermission(dto.roleIds, requester.roles);
      }

      await this.prisma.userRole.deleteMany({ where: { userId: id } });
      await this.prisma.userRole.createMany({
        data: dto.roleIds.map((roleId) => ({ userId: id, roleId })),
        skipDuplicates: true,
      });
    }

    const { roleIds: _, ...updateData } = dto;
    const user = await this.prisma.user.update({
      where:  { id },
      data:   updateData,
      select: USER_SELECT,
    });

    await this.logs.log({ userId: requester.sub, action: 'UPDATE_USER', resource: 'users', resourceId: id, ip });
    return user;
  }

  async remove(id: string, requesterId: string, ip: string) {
    const user = await this.prisma.user.findFirst({ where: { id, deletedAt: null } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (id === requesterId) throw new BadRequestException('No puede eliminarse a sí mismo');

    await this.prisma.user.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await this.logs.log({ userId: requesterId, action: 'DELETE_USER', resource: 'users', resourceId: id, ip });

    return { message: 'Usuario eliminado correctamente' };
  }

  // ─── HELPERS ─────────────────────────────────────────────────────────────────

  private async validateRoleCreationPermission(roleIds: string[], requesterRoles: string[]) {
    const requesterHighestRank = requesterRoles.reduce((min, roleType) => {
      const idx = ROLE_HIERARCHY.indexOf(roleType as RoleType);
      return idx !== -1 && idx < min ? idx : min;
    }, ROLE_HIERARCHY.length);

    const roles = await this.prisma.role.findMany({ where: { id: { in: roleIds } } });
    for (const role of roles) {
      const idx = ROLE_HIERARCHY.indexOf(role.type);
      if (idx <= requesterHighestRank) {
        throw new ForbiddenException(`No puede asignar el rol "${role.name}" — rango igual o superior al suyo`);
      }
    }
  }
}
