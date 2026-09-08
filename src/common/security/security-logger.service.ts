import { Injectable, Logger } from "@nestjs/common";

export type SecuritySeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface SecurityEvent {
  event: string;
  severity: SecuritySeverity;
  ip?: string;
  userId?: string;
  email?: string;
  details?: Record<string, unknown>;
}

/**
 * Emits structured security events to the application log stream.
 * These structured entries are designed to be consumed by SIEM/alerting
 * systems (Datadog, CloudWatch, Grafana Loki, etc.) via log aggregation.
 *
 * DB audit continues via LogsService — this layer is for real-time alerting.
 */
@Injectable()
export class SecurityLoggerService {
  private readonly logger = new Logger("SECURITY");

  loginFailed(ip: string, email: string, reason: string): void {
    this.emit({
      event: "AUTH_LOGIN_FAILED",
      severity: "MEDIUM",
      ip,
      email,
      details: { reason },
    });
  }

  accountLocked(ip: string, email: string, attempts: number): void {
    this.emit({
      event: "AUTH_ACCOUNT_LOCKED",
      severity: "HIGH",
      ip,
      email,
      details: { attempts },
    });
  }

  accountUnlocked(requesterId: string, targetId: string, ip: string): void {
    this.emit({
      event: "AUTH_ACCOUNT_UNLOCKED",
      severity: "MEDIUM",
      userId: requesterId,
      ip,
      details: { targetUserId: targetId },
    });
  }

  loginBlockedActiveSession(ip: string, email: string): void {
    this.emit({
      event: "AUTH_LOGIN_BLOCKED_ACTIVE_SESSION",
      severity: "MEDIUM",
      ip,
      email,
      details: { reason: "Ya existe una sesión activa para este usuario" },
    });
  }

  sessionForceClosed(requesterId: string, targetId: string, ip: string): void {
    this.emit({
      event: "AUTH_SESSION_FORCE_CLOSED",
      severity: "MEDIUM",
      userId: requesterId,
      ip,
      details: { targetUserId: targetId },
    });
  }

  sessionSuperseded(userId: string, ip: string): void {
    this.emit({
      event: "AUTH_SESSION_SUPERSEDED",
      severity: "LOW",
      userId,
      ip,
      details: { reason: "Nuevo login en otro dispositivo" },
    });
  }

  replayAttackDetected(userId: string, ip: string): void {
    this.emit({
      event: "AUTH_REPLAY_ATTACK",
      severity: "CRITICAL",
      userId,
      ip,
      details: { action: "ALL_SESSIONS_REVOKED" },
    });
  }

  tokenRevoked(userId: string, jti: string): void {
    this.emit({
      event: "AUTH_TOKEN_REVOKED",
      severity: "LOW",
      userId,
      details: { jti },
    });
  }

  blockedUserAccess(userId: string, ip: string): void {
    this.emit({
      event: "AUTH_BLOCKED_USER_ACCESS",
      severity: "HIGH",
      userId,
      ip,
    });
  }

  passwordChanged(userId: string, ip: string): void {
    this.emit({
      event: "AUTH_PASSWORD_CHANGED",
      severity: "MEDIUM",
      userId,
      ip,
    });
  }

  passwordReset(requesterId: string, targetId: string, ip: string): void {
    this.emit({
      event: "AUTH_PASSWORD_RESET",
      severity: "MEDIUM",
      userId: requesterId,
      ip,
      details: { targetUserId: targetId },
    });
  }

  private emit(ev: SecurityEvent): void {
    const payload = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...ev,
    });

    if (ev.severity === "CRITICAL" || ev.severity === "HIGH") {
      this.logger.error(payload);
    } else {
      this.logger.warn(payload);
    }
  }
}
