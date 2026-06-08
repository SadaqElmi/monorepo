import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { FastifyReply } from 'fastify';

const isProd = process.env.NODE_ENV === 'production';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const payload =
        typeof body === 'string'
          ? { statusCode: status, message: body }
          : { statusCode: status, ...(body as object) };
      response.status(status).send(payload);
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const { status, clientMessage, code } = prismaKnownToHttp(exception);
      const debugDetails = prismaKnownDebugDetails(exception);
      this.logger.error(
        `Prisma ${exception.code}: ${exception.message}${
          debugDetails.meta ? ` meta=${JSON.stringify(debugDetails.meta)}` : ''
        }`,
        exception.stack,
      );
      response.status(status).send({
        statusCode: status,
        message: clientMessage,
        error: code,
        ...(isProd ? {} : { details: debugDetails }),
      });
      return;
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      this.logger.warn(`Prisma validation: ${exception.message}`);
      response.status(HttpStatus.BAD_REQUEST).send({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid request data',
        error: 'VALIDATION_ERROR',
      });
      return;
    }

    const err =
      exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(err.message, err.stack);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: isProd ? 'Internal server error' : err.message,
      error: 'INTERNAL_ERROR',
      ...(isProd ? {} : { stack: err.stack }),
    });
  }
}

function prismaKnownToHttp(exception: Prisma.PrismaClientKnownRequestError): {
  status: number;
  clientMessage: string;
  code: string;
} {
  switch (exception.code) {
    case 'P2002': {
      const target = metaTarget(exception.meta);
      return {
        status: HttpStatus.CONFLICT,
        clientMessage:
          target.length > 0
            ? `A record with this ${target.join(', ')} already exists`
            : 'Duplicate record',
        code: 'UNIQUE_CONSTRAINT',
      };
    }
    case 'P2025':
      return {
        status: HttpStatus.NOT_FOUND,
        clientMessage: 'Record not found',
        code: 'NOT_FOUND',
      };
    case 'P2011':
    case 'P2012':
      return {
        status: HttpStatus.BAD_REQUEST,
        clientMessage: 'Required value missing',
        code: 'NULL_CONSTRAINT',
      };
    case 'P2003':
      return {
        status: HttpStatus.BAD_REQUEST,
        clientMessage: 'Related record is missing or invalid',
        code: 'FOREIGN_KEY',
      };
    case 'P2021':
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        clientMessage:
          'Database schema is incomplete for this tenant. Retry after provisioning or contact support.',
        code: 'TABLE_NOT_FOUND',
      };
    case 'P2010': {
      const pgMessage = prismaRawQueryMessage(exception.meta);
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        clientMessage:
          isProd || !pgMessage
            ? 'Database operation failed; the tenant schema may be out of date.'
            : `Database operation failed; the tenant schema may be out of date. (${pgMessage})`,
        code: 'RAW_QUERY_FAILED',
      };
    }
    default:
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        clientMessage: isProd
          ? 'Database error'
          : `Database error (${exception.code})`,
        code: 'DATABASE_ERROR',
      };
  }
}

function prismaRawQueryMessage(meta: unknown): string | undefined {
  if (!meta || typeof meta !== 'object') return undefined;
  const m = meta as { message?: unknown };
  return typeof m.message === 'string' && m.message.trim()
    ? m.message.trim()
    : undefined;
}

function prismaKnownDebugDetails(
  exception: Prisma.PrismaClientKnownRequestError,
): {
  prismaCode: string;
  rawQueryMessage?: string;
  meta?: Record<string, unknown>;
} {
  const rawQueryMessage = prismaRawQueryMessage(exception.meta);
  const meta =
    exception.meta && typeof exception.meta === 'object'
      ? (exception.meta as Record<string, unknown>)
      : undefined;
  return {
    prismaCode: exception.code,
    ...(rawQueryMessage ? { rawQueryMessage } : {}),
    ...(meta ? { meta } : {}),
  };
}

function metaTarget(meta: unknown): string[] {
  if (!meta || typeof meta !== 'object') return [];
  const t = (meta as { target?: unknown }).target;
  if (!Array.isArray(t)) return [];
  return t.filter((x): x is string => typeof x === 'string');
}
