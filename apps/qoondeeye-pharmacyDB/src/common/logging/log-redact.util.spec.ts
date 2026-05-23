import { redactForLog } from './log-redact.util';

describe('redactForLog', () => {
  it('redacts sensitive auth fields', () => {
    const input = {
      email: 'a@b.com',
      password: 'secret-pass',
      pin: '1234',
      accessToken: 'jwt-here',
      authorization: 'Bearer x',
      cookie: 'auth_token=abc',
      apiKey: 'key-123',
      nested: { refreshToken: 'rt' },
    };
    const out = redactForLog(input);
    expect(out.email).toBe('a@b.com');
    expect(out.password).toBe('[REDACTED]');
    expect(out.pin).toBe('[REDACTED]');
    expect(out.accessToken).toBe('[REDACTED]');
    expect(out.authorization).toBe('[REDACTED]');
    expect(out.cookie).toBe('[REDACTED]');
    expect(out.apiKey).toBe('[REDACTED]');
    expect((out.nested as { refreshToken: string }).refreshToken).toBe(
      '[REDACTED]',
    );
  });
});
