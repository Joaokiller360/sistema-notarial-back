import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { LogsService } from "../logs/logs.service";
import { BulkCreateClientsDto, CreateClientDto } from "./dto/create-client.dto";

@Injectable()
export class ClientsService {
  constructor(
    private prisma: PrismaService,
    private logs: LogsService,
  ) {}

  async create(dto: CreateClientDto, userId: string, ip: string) {
    const client = await this.prisma.client.create({ data: dto });

    await this.logs.log({
      userId,
      action: "CREATE_CLIENT",
      resource: "clients",
      resourceId: client.id,
      ip,
    });

    return client;
  }

  async bulkCreate(dto: BulkCreateClientsDto, userId: string, ip: string) {
    const result = await this.prisma.client.createMany({
      data: dto.clients,
      skipDuplicates: false,
    });

    await this.logs.log({
      userId,
      action: "BULK_CREATE_CLIENTS",
      resource: "clients",
      details: { count: result.count },
      ip,
    });

    return { created: result.count };
  }
}
