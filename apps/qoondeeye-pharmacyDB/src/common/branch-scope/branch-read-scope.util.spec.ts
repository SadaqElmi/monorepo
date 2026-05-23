import type { FastifyRequest } from 'fastify';

import { readScopeBranchIdsFromRequest } from './branch-read-scope.util';

describe('readScopeBranchIdsFromRequest', () => {
  it('prefers branchReadScope.readBranchIds when present', () => {
    const req = {
      branchReadScope: {
        readBranchIds: ['a', 'b'],
        readAllBranches: true,
        mutationBranchId: 'a',
      },
      allowedBranchIds: ['x'],
    } as unknown as FastifyRequest;
    expect(readScopeBranchIdsFromRequest(req)).toEqual(['a', 'b']);
  });

  it('falls back to allowedBranchIds when branchReadScope missing', () => {
    const req = { allowedBranchIds: ['u', 'v'] } as unknown as FastifyRequest;
    expect(readScopeBranchIdsFromRequest(req)).toEqual(['u', 'v']);
  });
});
