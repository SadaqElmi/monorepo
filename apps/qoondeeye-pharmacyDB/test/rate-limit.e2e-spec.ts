import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Rate limiting (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.RATE_LIMIT_ENABLED = 'true';
    process.env.LOGIN_RATE_LIMIT_TTL = '60';
    process.env.LOGIN_RATE_LIMIT_MAX = '2';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ trustProxy: true }),
    );
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    process.env.RATE_LIMIT_ENABLED = 'false';
    delete process.env.LOGIN_RATE_LIMIT_TTL;
    delete process.env.LOGIN_RATE_LIMIT_MAX;
    await app.close();
  });

  it('returns 429 after login rate limit exceeded', async () => {
    const payload = {
      email: 'rate-limit-test@example.com',
      password: 'wrong-password-123',
    };

    for (let i = 0; i < 2; i++) {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send(payload)
        .expect((res) => {
          expect(res.status).not.toBe(429);
        });
    }

    const blocked = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send(payload);

    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({
      statusCode: 429,
      error: 'RATE_LIMITED',
    });
    expect(blocked.body.message).toMatch(/too many requests/i);
  });

  it('does not rate limit health check', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer()).get('/api').expect(200);
    }
  });
});
