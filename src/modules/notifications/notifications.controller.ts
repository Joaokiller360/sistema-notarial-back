import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { RoleType } from "@prisma/client";
import { NotificationsService } from "./notifications.service";
import { CreateNotificationDto, NotificationType } from "./dto/create-notification.dto";
import { NotificationQueryDto } from "./dto/notification-query.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { RequireRoles } from "../../common/decorators/roles.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { PaginationDto } from "../../common/utils/pagination.util";

@ApiTags("Notifications")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @RequireRoles(RoleType.SUPER_ADMIN, RoleType.NOTARIO)
  @ApiOperation({ summary: "Enviar notificación" })
  create(@Body() dto: CreateNotificationDto, @CurrentUser() user: JwtPayload) {
    return this.notificationsService.create(dto, user.sub);
  }

  @Get("inbox")
  @SkipThrottle()
  @ApiOperation({ summary: "Bandeja de entrada del usuario autenticado" })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "limit", required: false })
  getInbox(
    @Query() pagination: PaginationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.notificationsService.getInbox(
      user.sub,
      pagination.page,
      pagination.limit,
    );
  }

  @Get("sent")
  @SkipThrottle()
  @UseGuards(RolesGuard)
  @RequireRoles(RoleType.SUPER_ADMIN, RoleType.NOTARIO)
  @ApiOperation({ summary: "Historial de notificaciones enviadas" })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({ name: "type", required: false, enum: NotificationType })
  @ApiQuery({ name: "read", required: false, type: Boolean })
  @ApiQuery({ name: "from", required: false })
  @ApiQuery({ name: "to", required: false })
  getSent(
    @Query() query: NotificationQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.notificationsService.getSent(
      user.sub,
      query.page,
      query.limit,
      query,
    );
  }

  @Patch("read-all")
  @ApiOperation({ summary: "Marcar todas las notificaciones del inbox como leídas" })
  markAllRead(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.markAllRead(user.sub);
  }

  @Patch(":id/read")
  @ApiOperation({ summary: "Marcar notificación como leída" })
  markRead(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.notificationsService.markRead(id, user.sub);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Eliminar notificación — broadcasts solo por remitente o Super Admin",
  })
  remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.notificationsService.remove(id, user.sub, user.roles);
  }
}
