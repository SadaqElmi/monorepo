import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { FastifyRequest } from 'fastify';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: FastifyRequest, _res: unknown, next: () => void): void {
    const headerId = req.headers['x-request-id'];
    const correlation = req.headers['x-correlation-id'];
    const fromHeader =
      (typeof headerId === 'string' && headerId.trim()) ||
      (typeof correlation === 'string' && correlation.trim()) ||
      '';
    req.requestId = fromHeader || randomUUID();
    req.requestStartedAt = Date.now();
    next();
  }
}
