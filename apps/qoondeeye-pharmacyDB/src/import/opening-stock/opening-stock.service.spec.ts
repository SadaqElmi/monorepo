import { OpeningStockService } from './opening-stock.service';

describe('OpeningStockService.createOpeningStock', () => {
  const inventoryService = {
    increaseStock: jest.fn().mockResolvedValue(undefined),
  };
  const accountingPosting = {
    postOpeningStockJournal: jest.fn().mockResolvedValue(undefined),
  };
  const lockDates = {
    assertEntryDateOpen: jest.fn().mockResolvedValue(undefined),
  };
  const auditLog = {
    append: jest.fn().mockResolvedValue(undefined),
  };

  const service = new OpeningStockService(
    inventoryService as never,
    accountingPosting as never,
    lockDates as never,
    auditLog as never,
  );

  const mockTx = {
    $queryRawUnsafe: jest
      .fn()
      .mockResolvedValueOnce([{ id: 'batch-1' }])
      .mockResolvedValueOnce([{ id: 'entry-1' }])
      .mockResolvedValueOnce([{ id: 'journal-1' }]),
    $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockTx.$queryRawUnsafe
      .mockReset()
      .mockResolvedValueOnce([{ id: 'batch-1' }])
      .mockResolvedValueOnce([{ id: 'entry-1' }])
      .mockResolvedValueOnce([{ id: 'journal-1' }]);
    mockTx.$executeRawUnsafe.mockReset().mockResolvedValue(undefined);
  });

  it('posts inventory, GL, and audit in order', async () => {
    const calls: string[] = [];
    lockDates.assertEntryDateOpen.mockImplementation(async () => {
      calls.push('lock');
    });
    inventoryService.increaseStock.mockImplementation(async () => {
      calls.push('inventory');
    });
    accountingPosting.postOpeningStockJournal.mockImplementation(async () => {
      calls.push('gl');
    });
    auditLog.append.mockImplementation(async () => {
      calls.push('audit');
    });

    const result = await service.createOpeningStock(mockTx as never, {
      branchId: 'branch-1',
      productId: 'product-1',
      quantity: 10,
      costPrice: 2.5,
      listPrice: 5,
      batchNumber: 'B1',
      expiryDate: '2027-01-01',
      entryDate: '2026-01-01',
      externalRef: null,
      importJobId: 'job-1',
      importJobRowId: 'row-1',
      userId: 'user-1',
    });

    expect(result).toMatchObject({
      batchId: 'batch-1',
      openingStockEntryId: 'entry-1',
      journalEntryId: 'journal-1',
    });
    expect(calls).toEqual(['lock', 'inventory', 'gl', 'audit']);
    expect(accountingPosting.postOpeningStockJournal).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        branchId: 'branch-1',
        openingStockEntryId: 'entry-1',
        inventoryTotal: 25,
        entryDate: '2026-01-01',
      }),
    );
  });
});
