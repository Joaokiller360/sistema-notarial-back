import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Observable } from "rxjs";
import { catchError, tap } from "rxjs/operators";
import { LogsService } from "../../modules/logs/logs.service";

// Path fragments whose requests are never persisted to the audit table.
// Keeps the log noise-free: token refresh, health probes, and the audit
// listing endpoint itself (would otherwise log every page view of the logs).
const SKIP_FRAGMENTS = ["/auth/refresh", "/health", "/logs"];

// Request body / query keys whose values are redacted before being stored.
const REDACT_KEY = /pass|password|token|secret|authorization|otp|code|pin/i;

// Max characters kept from the serialized `details` payload.
const DETAILS_MAX = 2000;

/**
 * Persists one row in the `logs` table for every HTTP request that mutates
 * state, performs a search, downloads a file, or hits an auth endpoint.
 *
 * Registered as APP_INTERCEPTOR (see AppModule) so it can inject LogsService.
 * Failures inside LogsService.log() are swallowed there — auditing never
 * breaks the request.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly apiPrefix: string;

  constructor(
    private readonly logs: LogsService,
    config: ConfigService,
  ) {
    this.apiPrefix = (config.get<string>("app.apiPrefix") || "api/v1").replace(
      /^\/|\/$/g,
      "",
    );
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== "http") return next.handle();

    const req = context.switchToHttp().getRequest();
    const method: string = req.method;

    if (method === "OPTIONS" || this.shouldSkip(req.originalUrl || req.url)) {
      return next.handle();
    }

    const path = (req.originalUrl || req.url || "").split("?")[0];
    const segments = this.pathSegments(path);
    const resource = segments[0] || undefined;

    const action = this.resolveAction(method, segments, req.query);

    // Only audit meaningful events: any mutation, any auth action, plus
    // GET requests that are a search (have query params) or a file download.
    const isMutation = method !== "GET";
    const isSearch = method === "GET" && Object.keys(req.query || {}).length > 0;
    const isDownload =
      method === "GET" && /(pdf|download|export|file)$/i.test(path);
    const isAuth = resource === "auth";
    if (!isMutation && !isSearch && !isDownload && !isAuth) {
      return next.handle();
    }

    const rawIp: string = req.ip || req.socket?.remoteAddress || "";
    const ip = rawIp.replace(/^::ffff:/, "") || undefined;
    const userAgent = (req.get?.("user-agent") || "").slice(0, 250) || undefined;
    const userId: string | undefined = req.user?.sub;
    const resourceId: string | undefined =
      req.params?.id || this.idFromSegments(segments) || undefined;

    const details = this.buildDetails(method, req);

    const persist = (statusCode: number, extra?: Record<string, any>) => {
      this.logs.log({
        userId,
        action,
        endpoint: `${method} ${path}`,
        method,
        resource,
        resourceId,
        details: extra ? { ...details, ...extra } : details,
        ip,
        userAgent,
        statusCode,
      });
    };

    return next.handle().pipe(
      tap(() => {
        const res = context.switchToHttp().getResponse();
        persist(res?.statusCode ?? 200);
      }),
      catchError((err) => {
        const status =
          typeof err?.getStatus === "function"
            ? err.getStatus()
            : err?.status ?? 500;
        persist(status, { error: err?.message ?? String(err) });
        throw err;
      }),
    );
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private shouldSkip(url: string): boolean {
    return SKIP_FRAGMENTS.some((f) => url.includes(f));
  }

  /** Strips the API prefix and returns the remaining path segments. */
  private pathSegments(path: string): string[] {
    const parts = path.split("/").filter(Boolean);
    const prefixParts = this.apiPrefix.split("/").filter(Boolean);
    if (
      prefixParts.every((p, i) => parts[i] === p)
    ) {
      return parts.slice(prefixParts.length);
    }
    return parts;
  }

  private idFromSegments(segments: string[]): string | undefined {
    // e.g. ["archives", "<uuid>", "pdf"] → "<uuid>"
    return segments.find(
      (s) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          s,
        ) || /^\d+$/.test(s),
    );
  }

  private resolveAction(
    method: string,
    segments: string[],
    query: Record<string, any>,
  ): string {
    const resource = segments[0];
    const tail = segments[segments.length - 1]?.toLowerCase();

    if (resource === "auth") {
      const sub = segments[1]?.toLowerCase();
      const map: Record<string, string> = {
        login: "LOGIN",
        logout: "LOGOUT",
        "change-password": "CHANGE_PASSWORD",
        "reset-password": "RESET_PASSWORD",
        "unlock-account": "UNLOCK_ACCOUNT",
        "force-logout": "FORCE_LOGOUT",
        me: "READ",
      };
      return map[sub] ?? "AUTH";
    }

    if (method === "GET") {
      if (/(pdf|download|export|file)$/i.test(tail ?? "")) return "DOWNLOAD";
      if (query && Object.keys(query).length > 0) return "SEARCH";
      return "READ";
    }

    switch (method) {
      case "POST":
        return "CREATE";
      case "PUT":
      case "PATCH":
        return "UPDATE";
      case "DELETE":
        return "DELETE";
      default:
        return method.toUpperCase();
    }
  }

  private buildDetails(
    method: string,
    req: any,
  ): Record<string, any> | undefined {
    let payload: any;
    if (method === "GET") {
      payload = req.query;
    } else {
      payload = req.body;
    }
    if (!payload || typeof payload !== "object") return undefined;
    if (Array.isArray(payload) ? payload.length === 0 : !Object.keys(payload).length)
      return undefined;

    const sanitized = this.redact(payload);
    const str = JSON.stringify(sanitized);
    if (str.length > DETAILS_MAX) {
      return { _truncated: true, preview: str.slice(0, DETAILS_MAX) };
    }
    return sanitized;
  }

  private redact(value: any, depth = 0): any {
    if (depth > 4) return "[deep]";
    if (Array.isArray(value)) {
      return value.slice(0, 50).map((v) => this.redact(v, depth + 1));
    }
    if (value && typeof value === "object") {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = REDACT_KEY.test(k) ? "[redacted]" : this.redact(v, depth + 1);
      }
      return out;
    }
    if (typeof value === "string" && value.length > 500) {
      return value.slice(0, 500) + "…";
    }
    return value;
  }
}
