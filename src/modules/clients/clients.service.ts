import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { LogsService } from "../logs/logs.service";
import { BulkCreateClientsDto, CreateClientDto } from "./dto/create-client.dto";
import {
  getPrismaSkipTake,
  paginate,
} from "../../common/utils/pagination.util";
import { validateIdentificacion } from "../../common/utils/identification.helper";

@Injectable()
export class ClientsService {
  constructor(
    private prisma: PrismaService,
    private logs: LogsService,
  ) {}

  async findAll(search: string | undefined, page: number, limit: number) {
    const where = search
      ? {
          OR: [
            { nombresCompletos: { contains: search, mode: "insensitive" as const } },
            { cedulaORuc: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [data, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        orderBy: { nombresCompletos: "asc" },
        ...getPrismaSkipTake(page, limit),
      }),
      this.prisma.client.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async create(dto: CreateClientDto, userId: string, ip: string) {
    // Validate identification format before persisting
    const validation = validateIdentificacion({
      cedulaORuc: dto.cedulaORuc,
      esPasaporte: dto.es_pasaporte,
      pasaporte: dto.pasaporte,
    });

    if (!validation.valid) {
      throw new BadRequestException(validation.error);
    }

    const client = await this.prisma.client.create({
      data: {
        nombresCompletos: dto.nombresCompletos,
        // Passport value is stored in cedulaORuc field (mutually exclusive)
        cedulaORuc: dto.es_pasaporte ? dto.pasaporte : dto.cedulaORuc,
        nacionalidad: dto.nacionalidad,
      },
    });

    await this.logs.log({
      userId,
      action: "CREATE_CLIENT",
      resource: "clients",
      resourceId: client.id,
      ip,
    });

    return client;
  }

  /**
   * Bulk import with per-row identification validation.
   * Invalid rows are skipped and reported; valid rows are persisted atomically.
   * Returns a summary with registros_importados, registros_con_error, and errores[].
   */
  async bulkCreate(dto: BulkCreateClientsDto, userId: string, ip: string) {
    const errores: Array<{
      fila: number;
      campo: string;
      valor: string;
      error: string;
    }> = [];

    const validClients: Array<{
      nombresCompletos: string;
      cedulaORuc?: string;
      nacionalidad?: string;
    }> = [];

    for (let i = 0; i < dto.clients.length; i++) {
      const client = dto.clients[i];
      const fila = i + 1;

      const validation = validateIdentificacion({
        cedulaORuc: client.cedulaORuc,
        esPasaporte: client.es_pasaporte,
        pasaporte: client.pasaporte,
      });

      if (!validation.valid) {
        const fieldValue = client.es_pasaporte
          ? (client.pasaporte ?? "")
          : (client.cedulaORuc ?? "");

        errores.push({
          fila,
          campo: validation.error!.campo,
          valor: fieldValue,
          error: validation.error!.mensaje,
        });
        continue; // Row with error is NOT persisted
      }

      validClients.push({
        nombresCompletos: client.nombresCompletos,
        cedulaORuc: client.es_pasaporte ? client.pasaporte : client.cedulaORuc,
        nacionalidad: client.nacionalidad,
      });
    }

    let registros_importados = 0;
    if (validClients.length > 0) {
      const result = await this.prisma.client.createMany({
        data: validClients,
        skipDuplicates: false,
      });
      registros_importados = result.count;
    }

    await this.logs.log({
      userId,
      action: "BULK_CREATE_CLIENTS",
      resource: "clients",
      details: {
        registros_importados,
        registros_con_error: errores.length,
      },
      ip,
    });

    return { registros_importados, registros_con_error: errores.length, errores };
  }
}
