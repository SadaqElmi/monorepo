import type { FastifyRequest } from 'fastify';
import { getClientIp } from './client-ip.util';

function mockReq(partial: Partial<FastifyRequest>): FastifyRequest {
  return partial as FastifyRequest;
}

describe('getClientIp', () => {
  it('prefers req.ips[0] over req.ip', () => {
    const req = mockReq({
      ips: ['203.0.113.50', '10.0.0.1'],
      ip: '10.0.0.1',
    });
    expect(getClientIp(req)).toBe('203.0.113.50');
  });

  it('falls back to req.ip when ips is empty', () => {
    const req = mockReq({ ips: [], ip: '198.51.100.2' });
    expect(getClientIp(req)).toBe('198.51.100.2');
  });

  it('returns unknown when no ip data', () => {
    const req = mockReq({});
    expect(getClientIp(req)).toBe('unknown');
  });
});
