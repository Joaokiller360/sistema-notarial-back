import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, RoleType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { LogsService } from "../logs/logs.service";
import { S3Service } from "../../common/s3/s3.service";
import { JwtPayload } from "../../common/decorators/current-user.decorator";
import {
  getPrismaSkipTake,
  paginate,
} from "../../common/utils/pagination.util";
import { CreateUafeFormDto } from "./dto/create-uafe-form.dto";
import { UpdateUafeFormDto } from "./dto/update-uafe-form.dto";
import { GetUafeFormsDto, NIVEL_RIESGO_VALUES } from "./dto/get-uafe-forms.dto";

const MAX_COMPROBANTES = 5;
const MAX_DATA_BYTES = 200_000;

type FormWithComprobantes = Prisma.UafeFormGetPayload<{
  include: { comprobantes: true };
}>;

@Injectable()
export class UafeFormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logs: LogsService,
    private readonly s3: S3Service,
  ) {}

  // ─── HELPERS ────────────────────────────────────────────────────────────────

  /** SUPER_ADMIN and NOTARIO see every form; everyone else only their own. */
  private canSeeAll(roles: string[]): boolean {
    return (
      roles.includes(RoleType.SUPER_ADMIN) || roles.includes(RoleType.NOTARIO)
    );
  }

  /**
   * Strips anything the backend must never persist (base64 receipt images) and
   * enforces a size cap on the free-form form payload.
   */
  private sanitizeData(raw: unknown): Record<string, any> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new BadRequestException("`data` debe ser un objeto");
    }
    // `comprobantes` se gestiona por endpoint dedicado (multipart) — nunca en el JSON
    const { comprobantes: _drop, ...rest } = raw as Record<string, any>;
    if (JSON.stringify(rest).length > MAX_DATA_BYTES) {
      throw new BadRequestException(
        "El contenido del formulario supera el tamaño máximo permitido",
      );
    }
    return rest;
  }

  /** Pulls the columns used by the list filters out of the form payload. */
  private extractMeta(data: Record<string, any>) {
    const str = (v: unknown, max: number) =>
      typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

    const nivelRaw = typeof data.nivelRiesgo === "string" ? data.nivelRiesgo : "";
    const nivelRiesgo = (NIVEL_RIESGO_VALUES as readonly string[]).includes(
      nivelRaw,
    )
      ? nivelRaw
      : null;

    return {
      nacionalidad: str(data.nacionalidad, 120),
      nivelRiesgo,
      comparecienteNombre: str(data.nombres, 250),
      comparecienteId: str(data.numeroId, 50),
    };
  }

  private async signComprobantes(
    comprobantes: { id: string; s3Key: string }[],
  ): Promise<{ id: string; url: string }[]> {
    return Promise.all(
      comprobantes.map(async (c) => ({
        id: c.id,
        // inline: son imágenes para previsualizar / anexar al PDF impreso
        url: await this.s3.getSignedUrl(c.s3Key, 3600, "inline"),
      })),
    );
  }

  private async serialize(form: FormWithComprobantes) {
    const { comprobantes, ...rest } = form;
    return { ...rest, comprobantes: await this.signComprobantes(comprobantes) };
  }

  /** Loads a form or throws 404 / 403 depending on ownership. */
  private async getOwnedForm(
    id: string,
    user: JwtPayload,
  ): Promise<FormWithComprobantes> {
    const form = await this.prisma.uafeForm.findUnique({
      where: { id },
      include: { comprobantes: true },
    });
    if (!form) throw new NotFoundException("Formulario no encontrado");
    if (!this.canSeeAll(user.roles) && form.filledById !== user.sub) {
      throw new ForbiddenException("No tiene acceso a este formulario");
    }
    return form;
  }

  // ─── LIST ───────────────────────────────────────────────────────────────────

  async findAll(user: JwtPayload, q: GetUafeFormsDto) {
    const where: Prisma.UafeFormWhereInput = {};

    if (!this.canSeeAll(user.roles)) {
      where.filledById = user.sub;
    }
    if (q.nacionalidad) {
      where.nacionalidad = { equals: q.nacionalidad, mode: "insensitive" };
    }
    if (q.nivelRiesgo) {
      where.nivelRiesgo = q.nivelRiesgo;
    }
    if (q.search) {
      const s = q.search;
      where.OR = [
        { comparecienteNombre: { contains: s, mode: "insensitive" } },
        { comparecienteId: { contains: s, mode: "insensitive" } },
        { filledByName: { contains: s, mode: "insensitive" } },
        { filledByEmail: { contains: s, mode: "insensitive" } },
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.uafeForm.findMany({
        where,
        include: { comprobantes: true },
        ...getPrismaSkipTake(q.page, q.limit),
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.uafeForm.count({ where }),
    ]);

    const data = await Promise.all(rows.map((r) => this.serialize(r)));
    return paginate(data, total, q.page, q.limit);
  }

  // ─── GET ONE ────────────────────────────────────────────────────────────────

  async findOne(id: string, user: JwtPayload) {
    const form = await this.getOwnedForm(id, user);
    return this.serialize(form);
  }

  // ─── CREATE ─────────────────────────────────────────────────────────────────

  async create(dto: CreateUafeFormDto, user: JwtPayload, ip: string) {
    const data = this.sanitizeData(dto.data);
    const meta = this.extractMeta(data);

    const dbUser = await this.prisma.user.findFirst({
      where: { id: user.sub, deletedAt: null },
      select: { firstName: true, lastName: true, email: true },
    });
    if (!dbUser) throw new NotFoundException("Usuario no encontrado");

    const form = await this.prisma.uafeForm.create({
      data: {
        filledById: user.sub,
        filledByName: `${dbUser.firstName} ${dbUser.lastName}`.trim(),
        filledByEmail: dbUser.email,
        filledByRole: user.roles[0] ?? "",
        templateId: dto.templateId,
        templateName: dto.templateName,
        data: data as Prisma.InputJsonValue,
        ...meta,
      },
      include: { comprobantes: true },
    });

    await this.logs.log({
      userId: user.sub,
      action: "CREATE_UAFE_FORM",
      resource: "uafe-forms",
      resourceId: form.id,
      ip,
    });

    return this.serialize(form);
  }

  // ─── UPDATE ─────────────────────────────────────────────────────────────────

  async update(
    id: string,
    dto: UpdateUafeFormDto,
    user: JwtPayload,
    ip: string,
  ) {
    await this.getOwnedForm(id, user);

    const data = this.sanitizeData(dto.data);
    const meta = this.extractMeta(data);

    const form = await this.prisma.uafeForm.update({
      where: { id },
      data: { data: data as Prisma.InputJsonValue, ...meta },
      include: { comprobantes: true },
    });

    await this.logs.log({
      userId: user.sub,
      action: "UPDATE_UAFE_FORM",
      resource: "uafe-forms",
      resourceId: id,
      ip,
    });

    return this.serialize(form);
  }

  // ─── DELETE ─────────────────────────────────────────────────────────────────

  async remove(id: string, user: JwtPayload, ip: string) {
    const form = await this.getOwnedForm(id, user);

    await this.prisma.uafeForm.delete({ where: { id } });

    // Best-effort S3 cleanup (row cascade already removed the records)
    await Promise.all(
      form.comprobantes.map((c) => this.s3.deleteFile(c.s3Key)),
    );

    await this.logs.log({
      userId: user.sub,
      action: "DELETE_UAFE_FORM",
      resource: "uafe-forms",
      resourceId: id,
      ip,
    });

    return { message: "Formulario eliminado correctamente" };
  }

  // ─── COMPROBANTES ───────────────────────────────────────────────────────────

  async addComprobantes(
    id: string,
    files: { buffer: Buffer; mimetype: string }[],
    user: JwtPayload,
    ip: string,
  ) {
    const form = await this.getOwnedForm(id, user);

    if (form.comprobantes.length + files.length > MAX_COMPROBANTES) {
      throw new BadRequestException(
        `Máximo ${MAX_COMPROBANTES} comprobantes por formulario (ya hay ${form.comprobantes.length})`,
      );
    }

    const created: { id: string; s3Key: string }[] = [];
    for (const file of files) {
      const key = await this.s3.uploadComprobante(file.buffer, file.mimetype);
      const row = await this.prisma.uafeComprobante.create({
        data: { formId: id, s3Key: key },
        select: { id: true, s3Key: true },
      });
      created.push(row);
    }

    await this.prisma.uafeForm.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    await this.logs.log({
      userId: user.sub,
      action: "ADD_UAFE_COMPROBANTES",
      resource: "uafe-forms",
      resourceId: id,
      details: { count: created.length },
      ip,
    });

    return this.signComprobantes(created);
  }

  async removeComprobante(
    id: string,
    comprobanteId: string,
    user: JwtPayload,
    ip: string,
  ) {
    await this.getOwnedForm(id, user);

    const row = await this.prisma.uafeComprobante.findUnique({
      where: { id: comprobanteId },
    });
    if (!row || row.formId !== id) {
      throw new NotFoundException("Comprobante no encontrado");
    }

    await this.prisma.uafeComprobante.delete({ where: { id: comprobanteId } });
    await this.s3.deleteFile(row.s3Key);

    await this.logs.log({
      userId: user.sub,
      action: "DELETE_UAFE_COMPROBANTE",
      resource: "uafe-forms",
      resourceId: id,
      details: { comprobanteId },
      ip,
    });

    return { message: "Comprobante eliminado" };
  }
}
