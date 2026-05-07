import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { JwtPayload } from '../decorators/current-user.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const user: JwtPayload = context.switchToHttp().getRequest().user;
    if (!user) return false;

    const hasAll = required.every((perm) => user.permissions?.includes(perm));

    if (!hasAll) {
      throw new ForbiddenException(
        `Permisos insuficientes. Requeridos: ${required.join(', ')}`,
      );
    }

    return true;
  }
}
