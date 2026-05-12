import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { RoleType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Prevents deletion of any Super Admin account regardless of the requester's role.
 * Apply to DELETE /users/:id alongside JwtAuthGuard and PermissionsGuard.
 *
 * This guard is implemented as a NestJS Guard (not Express middleware) because it
 * needs the JWT auth context already populated by JwtAuthGuard — guards execute
 * after middleware in NestJS's request lifecycle.
 */
@Injectable()
export class ProtectSuperAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const targetId: string = req.params?.id;

    if (!targetId) return true;

    const target = await this.prisma.user.findFirst({
      where: { id: targetId, deletedAt: null },
      include: {
        userRoles: {
          include: { role: { select: { type: true } } },
        },
      },
    });

    if (!target) return true; // NotFoundException handled downstream

    const targetIsSuperAdmin = target.userRoles.some(
      (ur) => ur.role.type === RoleType.SUPER_ADMIN,
    );

    if (targetIsSuperAdmin) {
      throw new ForbiddenException({
        success: false,
        codigo: 'SUPER_ADMIN_PROTEGIDO',
        mensaje: 'No es posible eliminar la cuenta Super Admin',
        campo: null,
      });
    }

    return true;
  }
}
