import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

/**
 * Rate-limit por usuario autenticado en vez de por IP.
 *
 * Motivo: detrás de un reverse proxy (Nginx / Dokploy / Traefik) muchas
 * peticiones legítimas comparten la IP del proxy o salen por NAT, así que un
 * límite por-IP castiga a varios usuarios a la vez. Con JWT presente usamos el
 * `sub` del token; las rutas anónimas (login, refresh) caen a IP.
 *
 * Best-effort: si el JwtAuthGuard global aún no pobló `req.user` cuando corre
 * este guard, se usa la IP — nunca lanza por eso.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId = req?.user?.sub;
    if (userId) return `user:${userId}`;

    const raw: string = req?.ip || req?.socket?.remoteAddress || "unknown";
    return `ip:${raw.replace(/^::ffff:/, "")}`;
  }
}
