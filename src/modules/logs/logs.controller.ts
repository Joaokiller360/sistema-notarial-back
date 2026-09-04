import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LogsService } from './logs.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { GetLogsDto } from './dto/get-logs.dto';

@ApiTags('Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('logs:read')
@Controller('logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener logs del sistema (solo Admin)' })
  findAll(@Query() query: GetLogsDto) {
    return this.logsService.findAll(query.page, query.limit, {
      userId: query.userId,
      action: query.action,
    });
  }
}
