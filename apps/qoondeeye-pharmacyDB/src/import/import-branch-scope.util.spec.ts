import type { FastifyRequest } from 'fastify';
import { resolveImportAllowedBranchIds } from './import-branch-scope.util';

describe('resolveImportAllowedBranchIds', () => {
  const listAll = jest.fn().mockResolvedValue(['branch-a', 'branch-b']);

  beforeEach(() => {
    listAll.mockClear();
  });

  it('uses read scope when multiple branches are visible', async () => {
    const req = {
      userRole: 'manager',
      userCanViewAllBranches: false,
      branchReadScope: {
        readBranchIds: ['branch-a', 'branch-b'],
        readAllBranches: false,
        mutationBranchId: 'branch-a',
      },
      allowedBranchIds: ['branch-a'],
    } as unknown as FastifyRequest;

    const ids = await resolveImportAllowedBranchIds(req, 'tenant', listAll);
    expect(ids).toEqual(['branch-a', 'branch-b']);
    expect(listAll).not.toHaveBeenCalled();
  });

  it('expands to all tenant branches for admin with single-branch mutation scope', async () => {
    const req = {
      userRole: 'admin',
      userCanViewAllBranches: true,
      branchReadScope: {
        readBranchIds: ['branch-a'],
        readAllBranches: false,
        mutationBranchId: 'branch-a',
      },
      allowedBranchIds: ['branch-a'],
    } as unknown as FastifyRequest;

    const ids = await resolveImportAllowedBranchIds(req, 'tenant', listAll);
    expect(ids).toEqual(['branch-a', 'branch-b']);
    expect(listAll).toHaveBeenCalledWith('tenant');
  });

  it('keeps single branch for restricted manager', async () => {
    const req = {
      userRole: 'manager',
      userCanViewAllBranches: false,
      branchReadScope: {
        readBranchIds: ['branch-a'],
        readAllBranches: false,
        mutationBranchId: 'branch-a',
      },
      allowedBranchIds: ['branch-a'],
    } as unknown as FastifyRequest;

    const ids = await resolveImportAllowedBranchIds(req, 'tenant', listAll);
    expect(ids).toEqual(['branch-a']);
    expect(listAll).not.toHaveBeenCalled();
  });
});
