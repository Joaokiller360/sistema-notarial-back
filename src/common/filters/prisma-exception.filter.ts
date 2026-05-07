import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response, Request } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx      = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request  = ctx.getRequest<Request>();

    let status  = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Error de base de datos';

    switch (exception.code) {
      case 'P2002':
        status  = HttpStatus.CONFLICT;
        message = `Ya existe un registro con ese valor. Campo: ${(exception.meta?.target as string[])?.join(', ')}`;
        break;
      case 'P2025':
        status  = HttpStatus.NOT_FOUND;
        message = 'Registro no encontrado';
        break;
      case 'P2003':
        status  = HttpStatus.BAD_REQUEST;
        message = 'Violación de restricción de clave foránea';
        break;
      case 'P2014':
        status  = HttpStatus.BAD_REQUEST;
        message = 'La relación requerida no puede ser eliminada';
        break;
      default:
        this.logger.error(`Unhandled Prisma error [${exception.code}]`, exception.stack);
    }

    response.status(status).json({
      statusCode: status,
      timestamp:  new Date().toISOString(),
      path:       request.url,
      method:     request.method,
      message,
      prismaCode: exception.code,
    });
  }
}
