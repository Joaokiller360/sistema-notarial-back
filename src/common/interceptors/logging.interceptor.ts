import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, throwError } from "rxjs";
import { catchError, tap } from "rxjs/operators";
import { randomBytes } from "crypto";

// Paths that must never have their response body logged (contain sensitive data)
const SENSITIVE_PATHS = ["/auth/login", "/auth/refresh", "/auth/change-password", "/auth/reset-password"];

function isSensitivePath(url: string): boolean {
  return SENSITIVE_PATHS.some((p) => url.includes(p));
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HTTP");

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, url } = req;

    // Sanitize IP: strip IPv6 prefix from ::ffff:x.x.x.x
    const rawIp: string = req.ip || req.socket?.remoteAddress || "unknown";
    const ip = rawIp.replace(/^::ffff:/, "");

    // User-agent truncated to 120 chars to prevent log injection via long UAs
    const userAgent = (req.get("user-agent") || "").slice(0, 120);

    // Unique request ID for correlating log lines across interceptors/filters
    const requestId = randomBytes(6).toString("hex");
    req["requestId"] = requestId;

    const start = Date.now();
    const sensitive = isSensitivePath(url);

    return next.handle().pipe(
      tap(() => {
        const res = context.switchToHttp().getResponse();
        const duration = Date.now() - start;
        this.logger.log(
          `[${requestId}] ${method} ${sensitive ? "[REDACTED]" : url} ${res.statusCode} +${duration}ms — ${ip}`,
        );
      }),
      catchError((err) => {
        const duration = Date.now() - start;
        this.logger.error(
          `[${requestId}] ${method} ${sensitive ? "[REDACTED]" : url} ERROR +${duration}ms — ${ip}`,
          // Include stack only in non-production or for server errors
          process.env.NODE_ENV !== "production" ? err.stack : err.message,
        );
        return throwError(() => err);
      }),
    );
  }
}
