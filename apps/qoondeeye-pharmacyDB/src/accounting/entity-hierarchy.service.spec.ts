import { EntityHierarchyService } from './entity-hierarchy.service';

describe('EntityHierarchyService', () => {
  it('resolves descendant entities and branch scope', async () => {
    const tx = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'root' }])
        .mockResolvedValueOnce([
          {
            parent_entity_id: 'root',
            child_entity_id: 'child',
            ownership_percent: '100.00',
          },
        ])
        .mockResolvedValueOnce([{ branch_id: 'b1' }, { branch_id: 'b2' }])
        .mockResolvedValueOnce([
          { branch_id: 'b1', entity_id: 'root' },
          { branch_id: 'b2', entity_id: 'child' },
        ]),
    };
    const svc = new EntityHierarchyService({} as never);
    const out = await svc.resolveScopeByEntityInTx(tx as never, 'root');
    expect(out.entityId).toBe('root');
    expect(out.descendantEntityIds).toEqual(['child', 'root']);
    expect(out.branchIds).toEqual(['b1', 'b2']);
  });

  it('rejects invalid ownership range', async () => {
    const tx = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'root' }])
        .mockResolvedValueOnce([
          {
            parent_entity_id: 'root',
            child_entity_id: 'child',
            ownership_percent: '120.00',
          },
        ]),
    };
    const svc = new EntityHierarchyService({} as never);
    await expect(
      svc.resolveScopeByEntityInTx(tx as never, 'root'),
    ).rejects.toThrow('Invalid entity ownership percent range');
  });
});
