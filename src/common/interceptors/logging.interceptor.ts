import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req    = context.switchToHttp().getRequest();
    const { method, url, ip } = req;
    const userAgent = req.get('user-agent') || '';
    const start  = Date.now();

    return next.handle().pipe(
      tap(() => {
        const res      = context.switchToHttp().getResponse();
        const duration = Date.now() - start;
        this.logger.log(`${method} ${url} ${res.statusCode} +${duration}ms — ${ip} ${userAgent}`);
      }),
      catchError((err) => {
        const duration = Date.now() - start;
        this.logger.error(`${method} ${url} ERROR +${duration}ms — ${ip}`, err.stack);
        return throwError(() => err);
      }),
    );
  }
}
