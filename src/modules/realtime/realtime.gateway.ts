import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Namespace, Socket } from "socket.io";

/**
 * Capa de notificaciones en tiempo real. Puramente aditiva: los servicios REST
 * llaman a emitToUser / emitToAll DESPUÉS de completar la operación normal.
 *
 * - Namespace: /realtime
 * - Auth: JWT en client.handshake.auth.token (o header Authorization: Bearer).
 *   Solo se verifica la firma con JWT_ACCESS_SECRET — la autorización de negocio
 *   ya la hizo el endpoint REST. Token inválido/expirado → disconnect, sin ruido.
 * - Room por usuario: `user:${userId}` — soporta varias pestañas/dispositivos.
 * - Todos los emit son silenciosos si el usuario no está conectado.
 */
@WebSocketGateway({
  namespace: "/realtime",
  cors: {
    origin: (process.env.CORS_ORIGINS || "http://localhost:3000").split(","),
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server!: Namespace;

  private readonly logger = new Logger(RealtimeGateway.name);

  // userId -> set de socket ids activos (varias pestañas / dispositivos)
  private readonly userSockets = new Map<string, Set<string>>();

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get<string>("jwt.accessSecret"),
      });

      const userId: string | undefined = payload?.sub;
      if (!userId) {
        client.disconnect();
        return;
      }

      client.data.userId = userId;
      client.join(`user:${userId}`);

      let set = this.userSockets.get(userId);
      if (!set) {
        set = new Set();
        this.userSockets.set(userId, set);
      }
      set.add(client.id);
    } catch {
      // Firma inválida / token expirado: el cliente reintentará con el token
      // nuevo tras /auth/refresh. No es un error del servidor.
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    const userId: string | undefined = client.data?.userId;
    if (!userId) return;

    const set = this.userSockets.get(userId);
    if (!set) return;

    set.delete(client.id);
    if (set.size === 0) this.userSockets.delete(userId);
  }

  // ── API pública para los servicios ─────────────────────────────────────────

  /** Emite un evento a todas las conexiones de un usuario. No-op si offline. */
  emitToUser(userId: string, event: string, payload: unknown): void {
    if (!userId || !this.userSockets.has(userId)) return;
    try {
      this.server.to(`user:${userId}`).emit(event, payload);
    } catch (e) {
      this.logger.warn(`emitToUser(${event}) falló: ${(e as Error).message}`);
    }
  }

  /** Emite un evento a todas las conexiones del namespace. */
  emitToAll(event: string, payload: unknown): void {
    try {
      this.server.emit(event, payload);
    } catch (e) {
      this.logger.warn(`emitToAll(${event}) falló: ${(e as Error).message}`);
    }
  }

  /** Cierra todos los sockets de un usuario (sesión única / force-logout). */
  disconnectUser(userId: string): void {
    if (!userId || !this.userSockets.has(userId)) return;
    try {
      this.server.in(`user:${userId}`).disconnectSockets(true);
    } catch (e) {
      this.logger.warn(`disconnectUser falló: ${(e as Error).message}`);
    }
    this.userSockets.delete(userId);
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private extractToken(client: Socket): string | undefined {
    const fromAuth = client.handshake.auth?.token;
    if (typeof fromAuth === "string" && fromAuth.length > 0) return fromAuth;

    const header = client.handshake.headers?.authorization;
    if (typeof header === "string" && header.startsWith("Bearer ")) {
      return header.slice(7);
    }
    return undefined;
  }
}
