import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateTaskDto } from "./dto/create-task.dto";
import { TaskQueryDto } from "./dto/task-query.dto";
import { TaskStatus } from "./dto/update-task-status.dto";
import {
  getPrismaSkipTake,
  paginate,
} from "../../common/utils/pagination.util";
import { stripHtml } from "../../common/utils/html.util";
import { RealtimeGateway } from "../realtime/realtime.gateway";

const TASK_INCLUDE = {
  sender: { select: { firstName: true, lastName: true } },
  recipient: { select: { firstName: true, lastName: true } },
};

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeGateway,
  ) {}

  private format(t: any) {
    return {
      id: t.id,
      senderId: t.senderId,
      senderName: t.sender ? `${t.sender.firstName} ${t.sender.lastName}` : "",
      recipientId: t.recipientId,
      recipientName: t.recipient
        ? `${t.recipient.firstName} ${t.recipient.lastName}`
        : "",
      // Tareas = texto plano en todos los destinos. Limpia también filas
      // antiguas guardadas con HTML.
      title: stripHtml(t.title),
      description: stripHtml(t.description),
      priority: t.priority,
      dueDate: t.dueDate instanceof Date
        ? t.dueDate.toISOString().split("T")[0]
        : t.dueDate,
      status: t.status,
      attachment:
        t.attachmentName
          ? {
              name: t.attachmentName,
              size: t.attachmentSize,
              mimeType: t.attachmentMime,
            }
          : null,
      createdAt: t.createdAt,
      readByRecipient: t.readByRecipient,
    };
  }

  async create(dto: CreateTaskDto, senderId: string) {
    const recipient = await this.prisma.user.findFirst({
      where: { id: dto.recipientId, deletedAt: null },
      select: { id: true },
    });
    if (!recipient) throw new NotFoundException("Destinatario no encontrado");

    const task = await this.prisma.task.create({
      data: {
        senderId,
        recipientId: dto.recipientId,
        // title / description = texto plano. Se limpia el HTML al guardar.
        title: stripHtml(dto.title),
        description: stripHtml(dto.description),
        priority: dto.priority as any,
        dueDate: new Date(dto.dueDate),
        attachmentName: dto.attachment?.name ?? null,
        attachmentSize: dto.attachment?.size ?? null,
        attachmentMime: dto.attachment?.mimeType ?? null,
      },
      include: TASK_INCLUDE,
    });

    const formatted = this.format(task);
    // Real-time: avisa al destinatario. No-op si no está conectado.
    this.realtime.emitToUser(dto.recipientId, "task:assigned", formatted);
    return formatted;
  }

  async getReceived(userId: string, page: number, limit: number, query: TaskQueryDto) {
    const where: any = { recipientId: userId };
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        include: TASK_INCLUDE,
        orderBy: { createdAt: "desc" },
        ...getPrismaSkipTake(page, limit),
      }),
      this.prisma.task.count({ where }),
    ]);

    return paginate(data.map((t) => this.format(t)), total, page, limit);
  }

  async getAssigned(userId: string, page: number, limit: number, query: TaskQueryDto) {
    const where: any = { senderId: userId };
    if (query.status) where.status = query.status;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        include: TASK_INCLUDE,
        orderBy: { createdAt: "desc" },
        ...getPrismaSkipTake(page, limit),
      }),
      this.prisma.task.count({ where }),
    ]);

    return paginate(data.map((t) => this.format(t)), total, page, limit);
  }

  async updateStatus(id: string, userId: string, status: TaskStatus) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException("Tarea no encontrada");
    if (task.recipientId !== userId) {
      throw new ForbiddenException(
        "Solo el destinatario puede cambiar el estado",
      );
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data: { status: status as any },
      include: TASK_INCLUDE,
    });

    // Real-time: avisa a quien asignó la tarea. No-op si no está conectado.
    this.realtime.emitToUser(updated.senderId, "task:status-updated", {
      taskId: updated.id,
      status: updated.status,
      updatedAt: new Date().toISOString(),
    });
    return this.format(updated);
  }

  async markRead(id: string, userId: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException("Tarea no encontrada");
    if (task.recipientId !== userId) {
      throw new ForbiddenException(
        "Solo el destinatario puede marcar como leída",
      );
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data: { readByRecipient: true },
      include: TASK_INCLUDE,
    });

    // Real-time: avisa a quien asignó la tarea que fue leída. No-op si no está
    // conectado. Sólo en la primera lectura.
    if (!task.readByRecipient) {
      this.realtime.emitToUser(updated.senderId, "task:read", {
        taskId: updated.id,
        readByRecipient: true,
        readAt: new Date().toISOString(),
      });
    }

    return this.format(updated);
  }

  async remove(id: string, userId: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException("Tarea no encontrada");

    const canDelete =
      task.senderId === userId || task.recipientId === userId;
    if (!canDelete) {
      throw new ForbiddenException(
        "No tienes permiso para eliminar esta tarea",
      );
    }

    await this.prisma.task.delete({ where: { id } });
  }
}
