import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(private config: ConfigService) {
    super({
      jwtFromRequest:        ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey:           config.get<string>('jwt.refreshSecret')!,
      ignoreExpiration:      false,
      passReqToCallback:     true,
    });
  }

  async validate(req: Request, payload: any) {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new UnauthorizedException();

    const refreshToken = authHeader.replace('Bearer ', '').trim();
    return { ...payload, refreshToken };
  }
}
