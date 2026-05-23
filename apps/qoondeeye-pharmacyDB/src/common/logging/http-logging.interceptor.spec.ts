import { ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { HttpLoggingInterceptor } from './http-logging.interceptor';
import { structuredLog } from './structured-logger';

jest.mock('./structured-logger', () => ({
  structuredLog: jest.fn(),
}));

describe('HttpLoggingInterceptor', () => {
  const interceptor = new HttpLoggingInterceptor();

  function mockContext(req: Record<string, unknown>, statusCode = 200) {
    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => ({
          statusCode,
          sent: false,
          header: jest.fn(),
        }),
      }),
    } as ExecutionContext;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('includes requestId in log fields', (done) => {
    const req = {
      method: 'GET',
      url: '/api/products',
      requestId: 'req-abc-123',
      requestStartedAt: Date.now() - 10,
      tenant: { id: 't1', schema_name: 'ph1', name: 'P' },
      branchId: 'b1',
      userId: 'u1',
    };

    interceptor
      .intercept(mockContext(req), { handle: () => of({ ok: true }) })
      .subscribe({
        complete: () => {
          expect(structuredLog).toHaveBeenCalled();
          const fields = (structuredLog as jest.Mock).mock.calls[0][1];
          expect(fields.requestId).toBe('req-abc-123');
          expect(fields.kind).toBe('http_request');
          expect(fields.path).toBe('/api/products');
          expect(fields).not.toHaveProperty('password');
          done();
        },
      });
  });

  it('marks auth routes without logging body', (done) => {
    const req = {
      method: 'POST',
      url: '/api/auth/login',
      body: { email: 'a@b.com', password: 'x' },
      requestId: 'r1',
      requestStartedAt: Date.now(),
    };

    interceptor
      .intercept(mockContext(req), { handle: () => of(null) })
      .subscribe({
        complete: () => {
          const fields = (structuredLog as jest.Mock).mock.calls[0][1];
          expect(fields.authRoute).toBe(true);
          expect(fields).not.toHaveProperty('body');
          done();
        },
      });
  });

  it('logs error message without stack in production', (done) => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const req = {
      method: 'GET',
      url: '/api/x',
      requestId: 'r2',
      requestStartedAt: Date.now(),
    };
    const err = new Error('boom');
    err.stack = 'stack-line';

    interceptor
      .intercept(mockContext(req, 500), {
        handle: () => throwError(() => err),
      })
      .subscribe({
        error: () => {
          const fields = (structuredLog as jest.Mock).mock.calls[0][1];
          expect(fields.errorMessage).toBe('boom');
          expect(fields).not.toHaveProperty('errorStack');
          process.env.NODE_ENV = prev;
          done();
        },
      });
  });
});
