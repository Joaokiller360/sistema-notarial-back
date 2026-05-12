import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { RoleType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LogsService } from '../../modules/logs/logs.service';
import { JwtPayload } from '../decorators/current-user.decorator';

/**
 * Prevents a NOTARIO from modifying or deleting a Super Admin account.
 * Apply to PATCH and DELETE /users/:id.
 *
 * For each blocked attempt this guard:
 *   1. Logs a WARN to the application logger with date, user, action, and target ID
 *   2. Persists a BLOCKED_* audit log entry via LogsService
 *
 * This guard is implemented as a NestJS Guard (not Express middleware) because it
 * needs the JWT auth context already populated by JwtAuthGuard — guards execute
 * after middleware in NestJS's request lifecycle.
 */
@Injectable()
export class NotarioRestrictionGuard implements CanActivate {
  private readonly logger = new Logger(NotarioRestrictionGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly logs: LogsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const requester: JwtPayload = req.user;

    // JwtAuthGuard hasn't run yet in some code paths; PermissionsGuard will reject unauthenticated requests
    if (!requester) return true;

    // Restriction only applies when the requester is a NOTARIO
    if (!requester.roles.includes(RoleType.NOTARIO)) return true;

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
      const action = req.method === 'DELETE' ? 'DELETE_USER' : 'UPDATE_USER';
      const ip: string = req.ip || req.socket?.remoteAddress || '';

      // Structured log for audit trail: date, user, attempted action, target ID
      this.logger.warn(
        `BLOCKED [${new Date().toISOString()}] NOTARIO ${requester.sub} attempted ${req.method} on Super Admin ${targetId}`,
      );

      await this.logs.log({
        userId: requester.sub,
        action: `BLOCKED_${action}`,
        resource: 'users',
        resourceId: targetId,
        details: {
          reason: 'NOTARIO_ATTEMPTED_SUPER_ADMIN_ACTION',
          method: req.method,
          blockedAt: new Date().toISOString(),
        },
        ip,
      });

      throw new ForbiddenException({
        success: false,
        codigo: 'PERMISO_DENEGADO',
        mensaje: 'No tienes permiso para realizar esta acción sobre la cuenta Super Admin',
        campo: null,
      });
    }

    return true;
  }
}
