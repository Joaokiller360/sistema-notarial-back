import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getPrismaSkipTake, paginate } from '../../common/utils/pagination.util';

interface LogInput {
  userId?:     string;
  action:      string;
  endpoint?:   string;
  method?:     string;
  resource?:   string;
  resourceId?: string;
  details?:    Record<string, any>;
  ip?:         string;
  userAgent?:  string;
  statusCode?: number;
}

@Injectable()
export class LogsService {
  private readonly logger = new Logger(LogsService.name);

  constructor(private prisma: PrismaService) {}

  async log(input: LogInput): Promise<void> {
    try {
      await this.prisma.log.create({ data: input });
    } catch (e) {
      // Never let log failures crash the request
      this.logger.error('Failed to save log', e);
    }
  }

  async findAll(page = 1, limit = 20, filters?: { userId?: string; action?: string }) {
    const where: any = {};
    if (filters?.userId) where.userId   = filters.userId;
    if (filters?.action) where.action   = { contains: filters.action, mode: 'insensitive' };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.log.findMany({
        where,
        ...getPrismaSkipTake(page, limit),
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
      }),
      this.prisma.log.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }
}
