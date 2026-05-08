import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { RoleType } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { PrismaService } from "../../prisma/prisma.service";
import { LogsService } from "../logs/logs.service";
import { LoginDto } from "./dto/login.dto";
import { ChangePasswordDto, ResetPasswordDto } from "./dto/change-password.dto";
import { LoginResponseDto } from "./dto/auth-response.dto";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private logs: LogsService,
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

    if (!user || !user.isActive) {
      throw new UnauthorizedException("Credenciales inválidas");
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) {
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

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      roles,
      permissions,
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
      },
    };
  }

  // ─── REFRESH ─────────────────────────────────────────────────────────────────

  async refreshTokens(
    userId: string,
    refreshToken: string,
    ip: string,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const stored = await this.prisma.refreshToken.findFirst({
      where: { token: refreshToken, userId, isRevoked: false },
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh token inválido o expirado");
    }

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

    const roles = user.userRoles.map((ur) => ur.role.type as string);
    const permissions = [
      ...new Set(
        user.userRoles.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) => rp.permission.name),
        ),
      ),
    ];

    const accessToken = this.generateAccessToken(
      user.id,
      user.email,
      roles,
      permissions,
    );
    const expiresIn = this.getAccessTokenExpiry();

    return { accessToken, expiresIn };
  }

  // ─── LOGOUT ──────────────────────────────────────────────────────────────────

  async logout(
    userId: string,
    refreshToken: string,
    ip: string,
  ): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { token: refreshToken, userId },
      data: { isRevoked: true },
    });

    await this.logs.log({ userId, action: "LOGOUT", resource: "auth", ip });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });
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
      data: { password: hashed },
    });
    await this.logoutAll(userId);

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

    // NOTARIO can only reset MATRIZADOR and ARCHIVADOR
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
      data: { password: hashed },
    });
    await this.logoutAll(dto.userId);

    await this.logs.log({
      userId: requesterId,
      action: "RESET_PASSWORD",
      resource: "users",
      resourceId: dto.userId,
      ip,
    });

    return { temporaryPassword: tempPassword };
  }

  // ─── HELPERS ─────────────────────────────────────────────────────────────────

  private async generateTokens(
    userId: string,
    email: string,
    roles: string[],
    permissions: string[],
  ) {
    const accessToken = this.generateAccessToken(
      userId,
      email,
      roles,
      permissions,
    );
    const refreshToken = uuidv4();
    const expiresIn = this.getAccessTokenExpiry();

    const refreshExpiration = this.config.get<string>("jwt.refreshExpiration")!;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.parseDays(refreshExpiration));

    await this.prisma.refreshToken.create({
      data: { token: refreshToken, userId, expiresAt },
    });

    // Clean up old revoked tokens
    await this.prisma.refreshToken.deleteMany({
      where: { userId, isRevoked: true, expiresAt: { lt: new Date() } },
    });

    return { accessToken, refreshToken, expiresIn };
  }

  private generateAccessToken(
    userId: string,
    email: string,
    roles: string[],
    permissions: string[],
  ): string {
    return this.jwt.sign(
      { sub: userId, email, roles, permissions },
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

  private generateTemporaryPassword(): string {
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@$!%*?&";
    let pass = "";
    for (let i = 0; i < 10; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  }
}
