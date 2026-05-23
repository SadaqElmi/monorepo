import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { ThrottlerLimitDetail } from '@nestjs/throttler';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { requestPathname } from '../http/request-pathname';
import { TenantContextService } from '../../tenant/tenant-context.service';
import {
  getRateLimitConfig,
  isRateLimitEnabled,
  RATE_LIMIT_KEY_PREFIX,
} from './rate-limit.config';
import {
  resolveRateLimitTier,
  shouldSkipRateLimitPath,
} from './rate-limit-paths';
import { buildRateLimitTracker } from './rate-limit-tracker.util';
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly tenantContext: TenantContextService,
  ) {
    super(options, storageService, reflector);
  }

  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (!isRateLimitEnabled()) return true;
    const { req } = this.getRequestResponse(context);
    const path = requestPathname(req as FastifyRequest);
    const method = (req as FastifyRequest).method ?? 'GET';
    if (shouldSkipRateLimitPath(path, method)) return true;
    return super.shouldSkip(context);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const fastifyReq = req as unknown as FastifyRequest;
    const { tracker } = buildRateLimitTracker(fastifyReq, this.tenantContext);
    return tracker;
  }

  protected generateKey(
    context: ExecutionContext,
    suffix: string,
    name: string,
  ): string {
    const { req } = this.getRequestResponse(context);
    const path = requestPathname(req as FastifyRequest);
    const tier = resolveRateLimitTier(
      path,
      (req as FastifyRequest).method ?? 'GET',
    );
    return `${RATE_LIMIT_KEY_PREFIX}:${tier}:${suffix}`;
  }

  protected async handleRequest(requestProps: Parameters<
    ThrottlerGuard['handleRequest']
  >[0]): Promise<boolean> {
    const { context } = requestProps;
    const { req } = this.getRequestResponse(context);
    const path = requestPathname(req as FastifyRequest);
    const tier = resolveRateLimitTier(
      path,
      (req as FastifyRequest).method ?? 'GET',
    );
    const config = getRateLimitConfig()[tier];

    return super.handleRequest({
      ...requestProps,
      limit: config.limit,
      ttl: config.ttlMs,
      blockDuration: config.ttlMs,
      throttler: {
        ...requestProps.throttler,
        name: tier,
      },
    });
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    _detail: ThrottlerLimitDetail,
  ): Promise<void> {
    void _detail;
    const { res } = this.getRequestResponse(context);
    const reply = res as FastifyReply;
    if (!reply.sent) {
      reply.header('Retry-After', '60');
    }
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many requests. Please try again later.',
        error: 'RATE_LIMITED',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
