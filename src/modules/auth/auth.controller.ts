import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto, ResetPasswordDto } from './dto/change-password.dto';
import { CurrentUser, JwtPayload } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip        = req.ip || req.socket.remoteAddress || '';
    const userAgent = req.get('user-agent') || '';
    return this.authService.login(dto, ip, userAgent);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar access token usando refresh token' })
  refresh(@Body() body: { userId: string; refreshToken: string }, @Req() req: Request) {
    const ip = req.ip || req.socket.remoteAddress || '';
    return this.authService.refreshTokens(body.userId, body.refreshToken, ip);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cerrar sesión' })
  logout(
    @CurrentUser() user: JwtPayload,
    @Body() body: { refreshToken: string },
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || '';
    return this.authService.logout(user.sub, body.refreshToken, ip);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cambiar contraseña propia' })
  changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || '';
    return this.authService.changePassword(user.sub, dto, ip);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @RequirePermissions('users:reset-password')
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resetear contraseña de otro usuario (Admin/Notario)' })
  resetPassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ResetPasswordDto,
    @Req() req: Request,
  ) {
    const ip = req.ip || req.socket.remoteAddress || '';
    return this.authService.resetPassword(user.sub, user.roles, dto, ip);
  }
}
