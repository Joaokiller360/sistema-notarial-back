import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
  permissions: string[];
  jti: string;   // JWT ID — required for logout denylist
  // Session epoch carried in the token. JwtStrategy rejects the token when it no
  // longer matches User.sessionEpoch (single-device enforcement).
  epoch?: number;
  // Resolved from DB on every request by JwtStrategy (not carried in the token).
  // true = user may not download/print archive PDFs.
  pdfDownloadDisabled?: boolean;
  iat?: number;
  exp?: number;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
