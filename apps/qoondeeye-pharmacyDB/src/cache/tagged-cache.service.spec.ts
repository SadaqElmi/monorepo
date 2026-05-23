import { TaggedCacheService } from './tagged-cache.service';

describe('TaggedCacheService', () => {
  it('falls back to factory when cache get throws', async () => {
    const cache = {
      get: jest.fn().mockRejectedValue(new Error('redis down')),
      set: jest.fn(),
      del: jest.fn(),
    };
    const service = new TaggedCacheService(cache as never, null);
    const factory = jest.fn().mockResolvedValue({ ok: true });

    const result = await service.getOrSet(
      'tenant:t1:branch:none:products:list',
      ['tenant:t1:catalog'],
      30_000,
      factory,
    );

    expect(result).toEqual({ ok: true });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('returns cached value on hit without calling factory', async () => {
    const cache = {
      get: jest.fn().mockResolvedValue([{ id: 'p1' }]),
      set: jest.fn(),
      del: jest.fn(),
    };
    const service = new TaggedCacheService(cache as never, null);
    const factory = jest.fn();

    const result = await service.getOrSet('key', ['tag'], 30_000, factory);

    expect(result).toEqual([{ id: 'p1' }]);
    expect(factory).not.toHaveBeenCalled();
  });
});
