import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { RoleType } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { createHash, randomBytes } from "crypto";
import { v4 as uuidv4 } from "uuid";
import { PrismaService } from "../../prisma/prisma.service";
import { LogsService } from "../logs/logs.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { TokenDenylistService } from "../../common/token-denylist/token-denylist.service";
import { SecurityLoggerService } from "../../common/security/security-logger.service";
import { LoginDto } from "./dto/login.dto";
import { ChangePasswordDto, ResetPasswordDto } from "./dto/change-password.dto";
import { LoginResponseDto } from "./dto/auth-response.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";

// Hash a raw token string with SHA-256 before storing in DB.
// Raw token is never persisted — only the hash is.
function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// A dummy bcrypt hash used when the email does not exist.
// Forces bcrypt.compare() to run regardless, preventing timing-based user enumeration.
const DUMMY_HASH =
  "$2b$12$invalidhashfortimingnormalization000000000000000000000000";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private logs: LogsService,
    private denylist: TokenDenylistService,
    private securityLogger: SecurityLoggerService,
    private realtime: RealtimeGateway,
  ) {}

  // ─── LOGIN ──────────────────────────────────────────────────────────────────

  async login(
    dto: LoginDto,
    ip: string,
    userAgent: string,
  ): Promise<LoginResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
      include: {
        userRoles: {
          include: {
            role: {
              include: { rolePermissions: { include: { permission: true } } },
            },
          },
        },
      },
    });

    // Always run bcrypt to prevent timing-based user enumeration.
    // If user not found we compare against a dummy hash (same time cost).
    const passwordMatch = await bcrypt.compare(
      dto.password,
      user?.password ?? DUMMY_HASH,
    );

    // Account locked by too many failed attempts — only a SUPER_ADMIN or NOTARIO
    // can unlock it (POST /auth/unlock-account).
    if (user && user.lockedAt) {
      this.securityLogger.accountLocked(ip, dto.email, user.failedLoginAttempts);
      await this.logs.log({
        userId: user.id,
        action: "LOGIN_BLOCKED_LOCKED",
        resource: "auth",
        ip,
        userAgent,
        details: { email: dto.email },
      });
      throw new ForbiddenException(
        "Cuenta bloqueada por múltiples intentos fallidos. Contacta a un administrador o notario para desbloquearla.",
      );
    }

    if (!user || !user.isActive || !passwordMatch) {
      // Count consecutive failures for a real, active account and lock it once
      // the configured threshold is reached.
      if (user && user.isActive && !passwordMatch) {
        const maxAttempts =
          this.config.get<number>("app.loginMaxAttempts") ?? 5;
        const updated = await this.prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: { increment: 1 } },
          select: { failedLoginAttempts: true },
        });
        if (updated.failedLoginAttempts >= maxAttempts) {
          await this.prisma.user.update({
            where: { id: user.id },
            data: { lockedAt: new Date() },
          });
          this.securityLogger.accountLocked(
            ip,
            dto.email,
            updated.failedLoginAttempts,
          );
          await this.logs.log({
            userId: user.id,
            action: "ACCOUNT_LOCKED",
            resource: "auth",
            ip,
            userAgent,
            details: {
              email: dto.email,
              attempts: updated.failedLoginAttempts,
            },
          });
        }
      }

      this.securityLogger.loginFailed(ip, dto.email, !user ? "user_not_found" : !user.isActive ? "user_inactive" : "wrong_password");
      await this.logs.log({
        action: "LOGIN_FAILED",
        resource: "auth",
        ip,
        userAgent,
        details: { email: dto.email },
      });
      throw new UnauthorizedException("Credenciales inválidas");
    }

    const roles = user.userRoles.map((ur) => ur.role.type as string);
    const permissions = [
      ...new Set(
        user.userRoles.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) => rp.permission.name),
        ),
      ),
    ];

    // ─── Sesión única: la primera sesión gana ───────────────────────────────
    // Si el usuario ya tiene una sesión ACTIVA (refresh token vigente + actividad
    // dentro de la ventana SESSION_IDLE_MINUTES) este login se rechaza y la sesión
    // original NO se toca. Cuando esa sesión cierra sesión, expira su refresh
    // token, o queda inactiva más que la ventana, el siguiente login entra y
    // toma su lugar (bump de epoch + revocación abajo).
    const idleMinutes =
      this.config.get<number>("app.sessionIdleMinutes") ?? 15;
    const idleCutoff = new Date(Date.now() - idleMinutes * 60_000);
    const activeSession = await this.prisma.refreshToken.findFirst({
      where: {
        userId: user.id,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    const recentlyActive =
      user.lastSeenAt != null && user.lastSeenAt > idleCutoff;
    if (activeSession && recentlyActive) {
      this.securityLogger.loginBlockedActiveSession(ip, dto.email);
      await this.logs.log({
        userId: user.id,
        action: "LOGIN_BLOCKED_ACTIVE_SESSION",
        resource: "auth",
        ip,
        userAgent,
        details: { email: dto.email },
      });
      throw new ConflictException(
        "Ya hay una sesión activa para este usuario en otro dispositivo. Cierra esa sesión o espera unos minutos e inténtalo de nuevo.",
      );
    }

    // Sesión anterior abandonada / inexistente: este login la reemplaza. Se
    // incrementa la época de sesión y se revoca todo refresh token previo para
    // cortar cualquier otro dispositivo al instante — su access token deja de
    // validar al no coincidir la época, y su próximo /auth/refresh se rechaza.
    const nextEpoch = user.sessionEpoch + 1;
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedAt: null,
        sessionEpoch: nextEpoch,
        lastSeenAt: new Date(),
      },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, isRevoked: false },
      data: { isRevoked: true },
    });
    // Corta también los sockets del dispositivo anterior (sesión única).
    this.realtime.disconnectUser(user.id);

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      roles,
      permissions,
      nextEpoch,
    );

    await this.logs.log({
      userId: user.id,
      action: "LOGIN",
      resource: "auth",
      ip,
      userAgent,
    });

    return {
      tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles,
        permissions,
        pdfDownloadDisabled: user.pdfDownloadDisabled,
      },
    };
  }

  // ─── ME — perfil del usuario autenticado ─────────────────────────────────────

  async getMe(userId: string): Promise<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: string[];
    permissions: string[];
    pdfDownloadDisabled: boolean;
  }> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true, deletedAt: null },
      include: {
        userRoles: {
          include: {
            role: {
              include: { rolePermissions: { include: { permission: true } } },
            },
          },
        },
      },
    });

    if (!user) throw new NotFoundException("Usuario no encontrado");

    const roles = user.userRoles.map((ur) => ur.role.type as string);
    const permissions = [
      ...new Set(
        user.userRoles.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) => rp.permission.name),
        ),
      ),
    ];

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles,
      permissions,
      pdfDownloadDisabled: user.pdfDownloadDisabled,
    };
  }

  // ─── REFRESH — token rotation with replay detection ──────────────────────────

  async refreshTokens(
    userId: string,
    refreshToken: string,
    ip: string,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const tokenHash = hashToken(refreshToken);

    const user = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true, deletedAt: null },
      include: {
        userRoles: {
          include: {
            role: {
              include: { rolePermissions: { include: { permission: true } } },
            },
          },
        },
      },
    });

    if (!user) throw new UnauthorizedException("Usuario no encontrado");

    // ATOMIC revocation: UPDATE ... WHERE isRevoked = false returns count=1 only
    // for the first concurrent request. Subsequent requests get count=0 → replay detected.
    // This eliminates the TOCTOU race between read-then-update patterns.
    const revoked = await this.prisma.refreshToken.updateMany({
      where: { token: tokenHash, userId, isRevoked: false },
      data: { isRevoked: true },
    });

    if (revoked.count === 0) {
      // Either token doesn't exist, is already revoked, or a concurrent request just consumed it.
      // Check if token exists at all to distinguish replay from invalid.
      const existing = await this.prisma.refreshToken.findFirst({
        where: { token: tokenHash, userId },
      });

      // A newer login on another device already revoked this token and bumped the
      // session epoch. This is the single-device cut-off, NOT a replay attack —
      // don't escalate or nuke every session, just tell the client to log in again.
      if (existing && existing.sessionEpoch !== user.sessionEpoch) {
        this.securityLogger.sessionSuperseded(userId, ip);
        await this.logs.log({
          userId,
          action: "SESSION_SUPERSEDED",
          resource: "auth",
          ip,
        });
        throw new UnauthorizedException(
          "Sesión iniciada en otro dispositivo. Inicia sesión nuevamente.",
        );
      }

      if (existing?.isRevoked) {
        // Token was previously valid but already consumed → replay attack.
        // Revoke ALL user sessions to force re-authentication.
        await this.prisma.refreshToken.updateMany({
          where: { userId },
          data: { isRevoked: true },
        });
        this.securityLogger.replayAttackDetected(userId, ip);
        await this.logs.log({
          userId,
          action: "REPLAY_ATTACK_DETECTED",
          resource: "auth",
          ip,
          details: { message: "All sessions revoked due to token reuse" },
        });
        throw new UnauthorizedException(
          "Sesión comprometida detectada. Inicia sesión nuevamente.",
        );
      }

      throw new UnauthorizedException("Refresh token inválido");
    }

    // Fetch the just-revoked record to get expiry
    const stored = await this.prisma.refreshToken.findFirst({
      where: { token: tokenHash, userId },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh token expirado");
    }

    // Valid token but from a session superseded by a newer login elsewhere.
    if (stored.sessionEpoch !== user.sessionEpoch) {
      this.securityLogger.sessionSuperseded(userId, ip);
      await this.logs.log({
        userId,
        action: "SESSION_SUPERSEDED",
        resource: "auth",
        ip,
      });
      throw new UnauthorizedException(
        "Sesión iniciada en otro dispositivo. Inicia sesión nuevamente.",
      );
    }

    const roles = user.userRoles.map((ur) => ur.role.type as string);
    const permissions = [
      ...new Set(
        user.userRoles.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) => rp.permission.name),
        ),
      ),
    ];

    // Issue new access + refresh tokens (keep original expiry for refresh)
    const newRefreshRaw = uuidv4();
    const newRefreshHash = hashToken(newRefreshRaw);

    await this.prisma.refreshToken.create({
      data: {
        token: newRefreshHash,
        userId,
        expiresAt: stored.expiresAt,
        sessionEpoch: user.sessionEpoch,
      },
    });

    // La sesión sigue viva — refresca la marca de actividad para la sesión única.
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastSeenAt: new Date() },
    });

    const accessToken = this.generateAccessToken(
      user.id,
      user.email,
      roles,
      permissions,
      user.sessionEpoch,
    );
    const expiresIn = this.getAccessTokenExpiry();

    return { accessToken, refreshToken: newRefreshRaw, expiresIn };
  }

  // ─── LOGOUT ──────────────────────────────────────────────────────────────────

  async logout(
    userId: string,
    refreshToken: string,
    jti: string | undefined,
    exp: number | undefined,
    ip: string,
  ): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { token: tokenHash, userId },
      data: { isRevoked: true },
    });

    // Deny the current access token for its remaining lifetime
    if (jti && exp) {
      await this.denylist.deny(jti, exp);
      this.securityLogger.tokenRevoked(userId, jti);
    }

    // Marca la sesión como cerrada para que otro login pueda entrar de inmediato.
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastSeenAt: null },
    });

    await this.logs.log({ userId, action: "LOGOUT", resource: "auth", ip });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });
    this.realtime.disconnectUser(userId);
  }

  // ─── UNLOCK ACCOUNT (SUPER_ADMIN / NOTARIO) ─────────────────────────────────
  // Clears a lockout caused by too many failed login attempts. Role is enforced
  // by RolesGuard on the controller (@RequireRoles SUPER_ADMIN, NOTARIO).

  async unlockAccount(
    requesterId: string,
    targetUserId: string,
    ip: string,
  ): Promise<{ success: true; message: string }> {
    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, deletedAt: null },
    });
    if (!target) throw new NotFoundException("Usuario no encontrado");

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { failedLoginAttempts: 0, lockedAt: null },
    });

    this.securityLogger.accountUnlocked(requesterId, targetUserId, ip);
    await this.logs.log({
      userId: requesterId,
      action: "ACCOUNT_UNLOCKED",
      resource: "users",
      resourceId: targetUserId,
      ip,
    });

    return { success: true, message: "Cuenta desbloqueada correctamente" };
  }

  // ─── FORCE LOGOUT (SUPER_ADMIN / NOTARIO) ───────────────────────────────────
  // Cierra a la fuerza la sesión activa de otro usuario: revoca sus refresh
  // tokens, incrementa sessionEpoch (invalida sus access tokens al instante) y
  // limpia lastSeenAt, de modo que ese usuario pueda volver a iniciar sesión de
  // inmediato aunque su sesión anterior nunca hiciera logout.

  async forceLogout(
    requesterId: string,
    targetUserId: string,
    ip: string,
  ): Promise<{ success: true; message: string }> {
    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, deletedAt: null },
      select: { id: true },
    });
    if (!target) throw new NotFoundException("Usuario no encontrado");

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { sessionEpoch: { increment: 1 }, lastSeenAt: null },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId: targetUserId, isRevoked: false },
      data: { isRevoked: true },
    });
    this.realtime.disconnectUser(targetUserId);

    this.securityLogger.sessionForceClosed(requesterId, targetUserId, ip);
    await this.logs.log({
      userId: requesterId,
      action: "SESSION_FORCE_CLOSED",
      resource: "users",
      resourceId: targetUserId,
      ip,
    });

    return { success: true, message: "Sesión cerrada correctamente" };
  }

  // ─── CHANGE PASSWORD ─────────────────────────────────────────────────────────

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    ip: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("Usuario no encontrado");

    const matches = await bcrypt.compare(dto.currentPassword, user.password);
    if (!matches) throw new BadRequestException("Contraseña actual incorrecta");

    const hashed = await bcrypt.hash(
      dto.newPassword,
      this.config.get<number>("jwt.bcryptRounds")!,
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed, sessionEpoch: { increment: 1 } },
    });
    await this.logoutAll(userId);

    this.securityLogger.passwordChanged(userId, ip);
    await this.logs.log({
      userId,
      action: "CHANGE_PASSWORD",
      resource: "auth",
      ip,
    });
  }

  // ─── RESET PASSWORD (admin / notario) ────────────────────────────────────────

  async resetPassword(
    requesterId: string,
    requesterRoles: string[],
    dto: ResetPasswordDto,
    ip: string,
  ): Promise<{ temporaryPassword: string }> {
    const target = await this.prisma.user.findFirst({
      where: { id: dto.userId, deletedAt: null },
      include: { userRoles: { include: { role: true } } },
    });

    if (!target) throw new NotFoundException("Usuario no encontrado");

    if (!requesterRoles.includes(RoleType.SUPER_ADMIN)) {
      const targetRoles = target.userRoles.map((ur) => ur.role.type as string);
      const allowedTargets: string[] = [
        RoleType.MATRIZADOR,
        RoleType.ARCHIVADOR,
      ];
      const canReset = targetRoles.every((r) => allowedTargets.includes(r));
      if (!canReset) {
        throw new ForbiddenException(
          "Solo puede resetear contraseñas de Matrizadores y Archivadores",
        );
      }
    }

    const tempPassword = dto.newPassword || this.generateTemporaryPassword();
    const hashed = await bcrypt.hash(
      tempPassword,
      this.config.get<number>("jwt.bcryptRounds")!,
    );

    await this.prisma.user.update({
      where: { id: dto.userId },
      data: { password: hashed, sessionEpoch: { increment: 1 } },
    });
    await this.logoutAll(dto.userId);

    this.securityLogger.passwordReset(requesterId, dto.userId, ip);
    await this.logs.log({
      userId: requesterId,
      action: "RESET_PASSWORD",
      resource: "users",
      resourceId: dto.userId,
      ip,
    });

    return { temporaryPassword: tempPassword };
  }

  // ─── UPDATE PROFILE ──────────────────────────────────────────────────────────

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
    ip: string,
  ): Promise<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: string[];
    permissions: string[];
    pdfDownloadDisabled: boolean;
  }> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user) throw new NotFoundException("Usuario no encontrado");

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
      },
    });

    await this.logs.log({
      userId,
      action: "UPDATE_PROFILE",
      resource: "auth",
      ip,
    });

    // Same shape as GET /auth/me — the frontend refreshes its store from this response
    return this.getMe(userId);
  }

  // ─── HELPERS ─────────────────────────────────────────────────────────────────

  private async generateTokens(
    userId: string,
    email: string,
    roles: string[],
    permissions: string[],
    epoch: number,
  ) {
    const accessToken = this.generateAccessToken(
      userId,
      email,
      roles,
      permissions,
      epoch,
    );
    const refreshRaw = uuidv4();
    const refreshHash = hashToken(refreshRaw);
    const expiresIn = this.getAccessTokenExpiry();

    const refreshExpiration = this.config.get<string>("jwt.refreshExpiration")!;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.parseDays(refreshExpiration));

    await this.prisma.refreshToken.create({
      data: { token: refreshHash, userId, expiresAt, sessionEpoch: epoch },
    });

    // Purge old revoked+expired tokens for this user (housekeeping)
    await this.prisma.refreshToken.deleteMany({
      where: { userId, isRevoked: true, expiresAt: { lt: new Date() } },
    });

    // Single-device: the caller (login) has already revoked every prior refresh
    // token, so there is no multi-session trimming to do here.

    return { accessToken, refreshToken: refreshRaw, expiresIn };
  }

  private generateAccessToken(
    userId: string,
    email: string,
    roles: string[],
    permissions: string[],
    epoch: number,
  ): string {
    const jti = uuidv4();
    return this.jwt.sign(
      { sub: userId, email, roles, permissions, jti, epoch },
      {
        secret: this.config.get<string>("jwt.accessSecret"),
        expiresIn: this.config.get<string>("jwt.accessExpiration") || "15m",
      },
    );
  }

  private getAccessTokenExpiry(): number {
    const expiration = this.config.get<string>("jwt.accessExpiration") || "15m";
    const match = expiration.match(/^(\d+)([mhd])$/);
    if (!match) return 900;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    if (unit === "m") return value * 60;
    if (unit === "h") return value * 3600;
    if (unit === "d") return value * 86400;
    return 900;
  }

  private parseDays(expiration: string): number {
    const match = expiration.match(/^(\d+)([mhd])$/);
    if (!match) return 7;
    const value = parseInt(match[1], 10);
    const unit = match[2];
    if (unit === "m") return Math.ceil(value / 1440);
    if (unit === "h") return Math.ceil(value / 24);
    if (unit === "d") return value;
    return 7;
  }

  // Uses crypto.randomBytes — cryptographically secure, unlike Math.random()
  private generateTemporaryPassword(): string {
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@$!%*?&";
    const bytes = randomBytes(12);
    return Array.from(bytes)
      .map((b) => chars[b % chars.length])
      .join("");
  }
}
