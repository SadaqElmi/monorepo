import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { HttpLoggingInterceptor } from './http-logging.interceptor';
import { RequestContextMiddleware } from './request-context.middleware';

@Global()
@Module({
  providers: [
    RequestContextMiddleware,
    HttpLoggingInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
  ],
  exports: [RequestContextMiddleware, HttpLoggingInterceptor],
})
export class LoggingModule {}
