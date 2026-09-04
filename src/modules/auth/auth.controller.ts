import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Request } from "express";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { ChangePasswordDto, ResetPasswordDto } from "./dto/change-password.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("login")
  @HttpCode(HttpStatus.OK)
  // 5 attempts/min per IP — protects against brute force
  @Throttle({ login: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: "Iniciar sesión" })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = req.ip || req.socket.remoteAddress || "";
    const userAgent = req.get("user-agent") || "";
    return this.authService.login(dto, ip, userAgent);
  }

  @Public()
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  // 10 refreshes/min per IP — prevents automated token harvesting
  @Throttle({ refresh: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: "Renovar tokens usando refresh token (rotación)" })
  refresh(
    @Body() body: { userId: string; refreshToken: string },
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || "";
    return this.authService.refreshTokens(body.userId, body.refreshToken, ip);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cerrar sesión (invalida access + refresh token)" })
  logout(
    @CurrentUser() user: JwtPayload,
    @Body() body: { refreshToken: string },
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || "";
    return this.authService.logout(
      user.sub,
      body.refreshToken,
      user.jti,
      user.exp,
      ip,
    );
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get("me")
  @ApiOperation({ summary: "Perfil del usuario autenticado (roles, permisos, flags)" })
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.getMe(user.sub);
  }

  // Self-service profile edit. The target is always the caller (user.sub from
  // the JWT) — no id in body/params, so nobody can edit another user here.
  // Deliberately NO PermissionsGuard / @RequirePermissions: that's for admins
  // editing OTHER users via PATCH /users/:id, not for editing your own name.
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch("me")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Actualizar nombre y apellido del usuario autenticado (self-service)" })
  updateMe(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || "";
    return this.authService.updateProfile(user.sub, dto, ip);
  }

  // Kept for backward compatibility — same behavior as PATCH /auth/me.
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch("profile")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Alias de PATCH /auth/me (compatibilidad)" })
  updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || "";
    return this.authService.updateProfile(user.sub, dto, ip);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post("change-password")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cambiar contraseña propia" })
  changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || "";
    return this.authService.changePassword(user.sub, dto, ip);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @RequirePermissions("users:reset-password")
  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Resetear contraseña de otro usuario (Admin/Notario)",
  })
  resetPassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ResetPasswordDto,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || "";
    return this.authService.resetPassword(user.sub, user.roles, dto, ip);
  }
}
