import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { RoleType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateNotificationDto } from "./dto/create-notification.dto";
import { NotificationQueryDto } from "./dto/notification-query.dto";
import {
  getPrismaSkipTake,
  paginate,
} from "../../common/utils/pagination.util";
import { RealtimeGateway } from "../realtime/realtime.gateway";

const SENDER_SELECT = { select: { firstName: true, lastName: true } };

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeGateway,
  ) {}

  /**
   * Batch-fetch user names for a list of IDs in a single query.
   * Returns a Map<userId, "FirstName LastName">.
   * Eliminates N+1 query pattern in getInbox/getSent.
   */
  private async fetchUserNames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true },
    });
    return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  }

  private format(
    n: any,
    recipientName: string,
  ) {
    return {
      id: n.id,
      senderId: n.senderId,
      senderName: n.sender
        ? `${n.sender.firstName} ${n.sender.lastName}`
        : "",
      recipientId: n.recipientId,
      recipientName,
      subject: n.subject,
      message: n.message,
      type: n.type,
      sentAt: n.sentAt,
      read: n.read,
    };
  }

  async create(dto: CreateNotificationDto, senderId: string) {
    if (dto.recipientId !== "ALL") {
      const exists = await this.prisma.user.findFirst({
        where: { id: dto.recipientId, deletedAt: null },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException("Destinatario no encontrado");
    }

    const notification = await this.prisma.notification.create({
      data: {
        senderId,
        recipientId: dto.recipientId,
        subject: dto.subject,
        message: dto.message,
        type: dto.type as any,
      },
      include: { sender: SENDER_SELECT },
    });

    const recipientName =
      dto.recipientId === "ALL"
        ? "Todos"
        : (await this.fetchUserNames([dto.recipientId])).get(dto.recipientId) ??
          "Desconocido";

    const payload = this.format(notification, recipientName);

    // Real-time: broadcast si es "ALL", si no al destinatario. No-op si offline.
    if (dto.recipientId === "ALL") {
      this.realtime.emitToAll("notification:new", payload);
    } else {
      this.realtime.emitToUser(dto.recipientId, "notification:new", payload);
    }
    return payload;
  }

  async getInbox(userId: string, page: number, limit: number) {
    const where = {
      OR: [{ recipientId: userId }, { recipientId: "ALL" }],
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        include: { sender: SENDER_SELECT },
        orderBy: { sentAt: "desc" },
        ...getPrismaSkipTake(page, limit),
      }),
      this.prisma.notification.count({ where }),
    ]);

    // Batch fetch all non-ALL recipient names in one query (eliminates N+1)
    const uniqueRecipientIds = [
      ...new Set(
        data.map((n) => n.recipientId).filter((id) => id !== "ALL"),
      ),
    ];
    const nameMap = await this.fetchUserNames(uniqueRecipientIds);

    const formatted = data.map((n) =>
      this.format(n, n.recipientId === "ALL" ? "Todos" : (nameMap.get(n.recipientId) ?? "Desconocido")),
    );

    return paginate(formatted, total, page, limit);
  }

  async getSent(
    userId: string,
    page: number,
    limit: number,
    query: NotificationQueryDto,
  ) {
    const where: any = { senderId: userId };
    if (query.type) where.type = query.type;
    if (query.read !== undefined) where.read = query.read;
    if (query.from || query.to) {
      where.sentAt = {};
      if (query.from) where.sentAt.gte = new Date(query.from);
      if (query.to) where.sentAt.lte = new Date(`${query.to}T23:59:59.999Z`);
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        include: { sender: SENDER_SELECT },
        orderBy: { sentAt: "desc" },
        ...getPrismaSkipTake(page, limit),
      }),
      this.prisma.notification.count({ where }),
    ]);

    // Batch fetch all non-ALL recipient names in one query (eliminates N+1)
    const uniqueRecipientIds = [
      ...new Set(
        data.map((n) => n.recipientId).filter((id) => id !== "ALL"),
      ),
    ];
    const nameMap = await this.fetchUserNames(uniqueRecipientIds);

    const formatted = data.map((n) =>
      this.format(n, n.recipientId === "ALL" ? "Todos" : (nameMap.get(n.recipientId) ?? "Desconocido")),
    );

    return paginate(formatted, total, page, limit);
  }

  async markRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
      include: { sender: SENDER_SELECT },
    });
    if (!notification) throw new NotFoundException("Notificación no encontrada");

    const isRecipient =
      notification.recipientId === userId || notification.recipientId === "ALL";
    if (!isRecipient) {
      throw new ForbiddenException(
        "Solo el destinatario puede marcar como leída",
      );
    }

    const updated = await this.prisma.notification.update({
      where: { id },
      data: { read: true },
      include: { sender: SENDER_SELECT },
    });

    const nameMap = await this.fetchUserNames(
      updated.recipientId !== "ALL" ? [updated.recipientId] : [],
    );
    const recipientName =
      updated.recipientId === "ALL"
        ? "Todos"
        : (nameMap.get(updated.recipientId) ?? "Desconocido");

    return this.format(updated, recipientName);
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: {
        OR: [{ recipientId: userId }, { recipientId: "ALL" }],
        read: false,
      },
      data: { read: true },
    });
    return { updated: result.count };
  }

  async remove(id: string, userId: string, userRoles: string[]) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification) throw new NotFoundException("Notificación no encontrada");

    const isSuperAdmin = userRoles.includes(RoleType.SUPER_ADMIN);

    if (notification.recipientId === "ALL") {
      // Broadcast notifications can only be deleted by sender or SUPER_ADMIN.
      // Any other user "deleting" a broadcast would remove it for everyone.
      if (notification.senderId !== userId && !isSuperAdmin) {
        throw new ForbiddenException(
          "Solo el remitente o un Super Admin puede eliminar notificaciones enviadas a todos",
        );
      }
    } else {
      // Personal notifications: sender or recipient may delete
      const canDelete =
        notification.senderId === userId ||
        notification.recipientId === userId ||
        isSuperAdmin;

      if (!canDelete) {
        throw new ForbiddenException(
          "No tienes permiso para eliminar esta notificación",
        );
      }
    }

    await this.prisma.notification.delete({ where: { id } });
  }
}
