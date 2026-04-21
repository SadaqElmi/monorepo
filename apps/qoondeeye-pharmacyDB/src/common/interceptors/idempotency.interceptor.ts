import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import { IdempotencyService } from '../services/idempotency.service';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotency: IdempotencyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const method = (req.method ?? '').toUpperCase();
    const isMutation =
      method === 'POST' || method === 'PATCH' || method === 'PUT';
    const schemaName = req.tenant?.schema_name ?? null;
    const rawIdempotency = req.headers['x-idempotency-key'];
    const idempotencyKey =
      typeof rawIdempotency === 'string' ? rawIdempotency.trim() : '';

    if (!isMutation || !schemaName || !idempotencyKey) {
      return next.handle();
    }

    const fingerprint = this.fingerprint({
      method,
      path: req.originalUrl || req.url || '',
      body: req.body,
    });

    return from(
      this.idempotency.beginOrReplay(schemaName, {
        idempotencyKey,
        requestFingerprint: fingerprint,
        method,
        path: req.originalUrl || req.url || '',
      }),
    ).pipe(
      mergeMap((state) => {
        if (state.kind === 'replay') {
          res.status(state.statusCode);
          res.setHeader('X-Idempotency-Replayed', '1');
          return of(state.responseBody);
        }
        req.idempotencyKey = idempotencyKey;
        const correlationRaw = req.headers['x-correlation-id'];
        const causationRaw = req.headers['x-causation-id'];
        req.correlationId =
          typeof correlationRaw === 'string'
            ? correlationRaw.trim()
            : undefined;
        req.causationId =
          typeof causationRaw === 'string' ? causationRaw.trim() : undefined;

        return next.handle().pipe(
          mergeMap((data) =>
            from(
              this.idempotency.complete(
                schemaName,
                idempotencyKey,
                Number(res.statusCode || 200),
                data,
              ),
            ).pipe(mergeMap(() => of(data))),
          ),
          catchError((error: unknown) =>
            from(
              this.idempotency.fail(
                schemaName,
                idempotencyKey,
                this.errorStatus(error),
                this.errorMessage(error),
              ),
            ).pipe(mergeMap(() => throwError(() => error))),
          ),
        );
      }),
    );
  }

  private fingerprint(input: {
    method: string;
    path: string;
    body: unknown;
  }): string {
    const raw = JSON.stringify({
      method: input.method,
      path: input.path,
      body: input.body ?? null,
    });
    return createHash('sha256').update(raw).digest('hex');
  }

  private errorStatus(error: unknown): number {
    if (
      typeof error === 'object' &&
      error != null &&
      'status' in error &&
      typeof (error as { status?: unknown }).status === 'number'
    ) {
      return (error as { status: number }).status;
    }
    return 500;
  }

  private errorMessage(error: unknown): string {
    if (
      typeof error === 'object' &&
      error != null &&
      'message' in error &&
      typeof (error as { message?: unknown }).message === 'string'
    ) {
      return (error as { message: string }).message;
    }
    return 'Request failed';
  }
}
