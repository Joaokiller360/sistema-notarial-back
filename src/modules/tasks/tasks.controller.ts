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
import { TasksService } from "./tasks.service";
import { CreateTaskDto, TaskPriority } from "./dto/create-task.dto";
import { UpdateTaskStatusDto, TaskStatus } from "./dto/update-task-status.dto";
import { TaskQueryDto } from "./dto/task-query.dto";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { RequireRoles } from "../../common/decorators/roles.decorator";
import {
  CurrentUser,
  JwtPayload,
} from "../../common/decorators/current-user.decorator";
import { PaginationDto } from "../../common/utils/pagination.util";

@ApiTags("Tasks")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("tasks")
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @UseGuards(RolesGuard)
  @RequireRoles(RoleType.SUPER_ADMIN, RoleType.NOTARIO)
  @ApiOperation({ summary: "Asignar tarea" })
  create(@Body() dto: CreateTaskDto, @CurrentUser() user: JwtPayload) {
    return this.tasksService.create(dto, user.sub);
  }

  @Get("received")
  @SkipThrottle()
  @ApiOperation({ summary: "Tareas recibidas por el usuario autenticado" })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({ name: "status", required: false, enum: TaskStatus })
  @ApiQuery({ name: "priority", required: false, enum: TaskPriority })
  getReceived(
    @Query() pagination: PaginationDto,
    @Query() query: TaskQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tasksService.getReceived(
      user.sub,
      pagination.page,
      pagination.limit,
      query,
    );
  }

  @Get("assigned")
  @SkipThrottle()
  @UseGuards(RolesGuard)
  @RequireRoles(RoleType.SUPER_ADMIN, RoleType.NOTARIO)
  @ApiOperation({ summary: "Tareas asignadas por el usuario autenticado" })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({ name: "status", required: false, enum: TaskStatus })
  getAssigned(
    @Query() pagination: PaginationDto,
    @Query() query: TaskQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tasksService.getAssigned(
      user.sub,
      pagination.page,
      pagination.limit,
      query,
    );
  }

  @Patch(":id/status")
  @ApiOperation({ summary: "Cambiar estado de tarea (solo destinatario)" })
  updateStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tasksService.updateStatus(id, user.sub, dto.status);
  }

  @Patch(":id/read")
  @ApiOperation({ summary: "Marcar tarea como leída (solo destinatario)" })
  markRead(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tasksService.markRead(id, user.sub);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Eliminar tarea (remitente o destinatario)" })
  remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tasksService.remove(id, user.sub);
  }
}
