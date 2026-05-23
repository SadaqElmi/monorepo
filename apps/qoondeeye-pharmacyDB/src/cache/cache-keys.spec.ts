import { catalogListCacheKey, normalizeBranchScope } from './cache-keys';
import { catalogBranchTags } from './cache-tags';

describe('catalog cache keys', () => {
  it('includes tenantId and sorted branch scope', () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const scope = normalizeBranchScope([
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    ]);
    expect(scope).toBe(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa,bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    );
    expect(catalogListCacheKey(tenantId, scope, 'products')).toBe(
      `tenant:${tenantId}:branch:${scope}:products:list`,
    );
  });

  it('builds per-branch invalidation tags', () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const tags = catalogBranchTags(tenantId, ['branch-a']);
    expect(tags).toEqual([`tenant:${tenantId}:branch:branch-a:catalog`]);
  });
});
