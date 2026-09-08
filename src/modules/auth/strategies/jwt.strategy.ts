import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from "../../../prisma/prisma.service";
import { TokenDenylistService } from "../../../common/token-denylist/token-denylist.service";
import { JwtPayload } from "../../../common/decorators/current-user.decorator";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private denylist: TokenDenylistService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>("jwt.accessSecret")!,
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // Reject tokens that were explicitly revoked on logout
    if (payload.jti && (await this.denylist.isDenied(payload.jti))) {
      throw new UnauthorizedException("Token revocado");
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, isActive: true, deletedAt: null },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException("Usuario no encontrado o inactivo");
    }

    // Single-device enforcement: a newer login (or a password change) bumps
    // User.sessionEpoch, leaving every previously issued access token stale.
    // Tokens minted before this feature carry no `epoch` claim → treated as 0.
    if ((payload.epoch ?? 0) !== user.sessionEpoch) {
      throw new UnauthorizedException(
        "Sesión iniciada en otro dispositivo",
      );
    }

    const roles = user.userRoles.map((ur) => ur.role.type);
    const permissions = [
      ...new Set(
        user.userRoles.flatMap((ur) =>
          ur.role.rolePermissions.map((rp) => rp.permission.name),
        ),
      ),
    ];

    return {
      sub: user.id,
      email: user.email,
      roles,
      permissions,
      pdfDownloadDisabled: user.pdfDownloadDisabled,
      epoch: user.sessionEpoch,
      jti: payload.jti,
      exp: payload.exp,
    } as JwtPayload;
  }
}
