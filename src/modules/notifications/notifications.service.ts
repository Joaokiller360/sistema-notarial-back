import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateNotificationDto } from "./dto/create-notification.dto";
import { NotificationQueryDto } from "./dto/notification-query.dto";
import {
  getPrismaSkipTake,
  paginate,
} from "../../common/utils/pagination.util";

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  private async getUserFullName(id: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { firstName: true, lastName: true },
    });
    return user ? `${user.firstName} ${user.lastName}` : "Desconocido";
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

  private async resolveRecipientName(recipientId: string): Promise<string> {
    if (recipientId === "ALL") return "Todos";
    return this.getUserFullName(recipientId);
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
      include: { sender: { select: { firstName: true, lastName: true } } },
    });

    const recipientName = await this.resolveRecipientName(dto.recipientId);
    return this.format(notification, recipientName);
  }

  async getInbox(userId: string, page: number, limit: number) {
    const where = {
      OR: [{ recipientId: userId }, { recipientId: "ALL" }],
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        include: { sender: { select: { firstName: true, lastName: true } } },
        orderBy: { sentAt: "desc" },
        ...getPrismaSkipTake(page, limit),
      }),
      this.prisma.notification.count({ where }),
    ]);

    const formatted = await Promise.all(
      data.map(async (n) => {
        const recipientName = await this.resolveRecipientName(n.recipientId);
        return this.format(n, recipientName);
      }),
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
        include: { sender: { select: { firstName: true, lastName: true } } },
        orderBy: { sentAt: "desc" },
        ...getPrismaSkipTake(page, limit),
      }),
      this.prisma.notification.count({ where }),
    ]);

    const formatted = await Promise.all(
      data.map(async (n) => {
        const recipientName = await this.resolveRecipientName(n.recipientId);
        return this.format(n, recipientName);
      }),
    );

    return paginate(formatted, total, page, limit);
  }

  async markRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
      include: { sender: { select: { firstName: true, lastName: true } } },
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
      include: { sender: { select: { firstName: true, lastName: true } } },
    });

    const recipientName = await this.resolveRecipientName(updated.recipientId);
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

  async remove(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification) throw new NotFoundException("Notificación no encontrada");

    const canDelete =
      notification.senderId === userId ||
      notification.recipientId === userId ||
      notification.recipientId === "ALL";

    if (!canDelete) {
      throw new ForbiddenException(
        "No tienes permiso para eliminar esta notificación",
      );
    }

    await this.prisma.notification.delete({ where: { id } });
  }
}
