import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Observable, tap } from 'rxjs';
import { requestPathname } from '../http/request-pathname';
import { isReportsPathForLogging } from '../rate-limit/rate-limit-paths';
import { isAuthPath } from './log-redact.util';
import { structuredLog } from './structured-logger';

function envInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : defaultValue;
}

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<FastifyRequest>();
    const res = http.getResponse<FastifyReply>();
    if (!req.requestId) {
      req.requestId = randomUUID();
    }
    if (!req.requestStartedAt) {
      req.requestStartedAt = Date.now();
    }
    const startedAt = req.requestStartedAt;
    const path = requestPathname(req);

    if (
      typeof res.header === 'function' &&
      !(res as { sent?: boolean }).sent
    ) {
      res.header('x-request-id', req.requestId);
    }

    return next.handle().pipe(
      tap({
        next: () => this.logRequest(req, res, path, startedAt),
        error: (err: unknown) => {
          this.logRequest(req, res, path, startedAt, err);
        },
      }),
    );
  }

  private logRequest(
    req: FastifyRequest,
    res: FastifyReply,
    path: string,
    startedAt: number,
    err?: unknown,
  ): void {
    const durationMs = Date.now() - startedAt;
    let statusCode = res.statusCode;
    if (err instanceof HttpException) {
      statusCode = err.getStatus();
    } else if (err && typeof err === 'object' && 'status' in err) {
      statusCode = Number((err as { status?: number }).status) || 500;
    } else if (!statusCode) {
      statusCode = err ? 500 : 200;
    }

    const fields: Record<string, unknown> = {
      kind: 'http_request',
      requestId: req.requestId ?? null,
      method: req.method,
      path,
      statusCode,
      durationMs,
      tenantId: req.tenant?.id ?? null,
      branchId: req.branchId ?? null,
      userId: req.userId ?? null,
    };

    if (err instanceof Error) {
      fields.errorMessage = err.message;
      if (process.env.NODE_ENV !== 'production') {
        fields.errorStack = err.stack;
      }
    }

    const slowApiMs = envInt('LOG_SLOW_API_MS', 500);
    const slowReportMs = envInt('LOG_SLOW_REPORT_MS', 2000);
    const slowThreshold = isReportsPathForLogging(path)
      ? slowReportMs
      : slowApiMs;

    const level =
      durationMs > slowThreshold ? 'warn' : err ? 'error' : 'log';

    if (isAuthPath(path)) {
      fields.authRoute = true;
    }

    structuredLog(level === 'error' && !err ? 'log' : level, fields);
  }
}
