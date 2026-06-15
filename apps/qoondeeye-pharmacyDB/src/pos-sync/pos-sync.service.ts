import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PosCashDrawerService } from '../pos-cash-drawer/pos-cash-drawer.service';
import { SalesService } from '../sales/sales.service';
import { BatchSyncCashMovementItemDto } from './dto/batch-sync-cash.dto';
import { BatchSyncSaleItemDto } from './dto/batch-sync.dto';

export type BatchSyncItemResult = {
  clientSaleRef: string;
  status: 'accepted' | 'duplicate' | 'conflict';
  saleId?: string;
  receiptNumber?: string | null;
  message?: string;
};

export type BatchSyncCashResult = {
  clientRef: string;
  status: 'accepted' | 'duplicate' | 'conflict';
  movementId?: string;
  message?: string;
};

@Injectable()
export class PosSyncService {
  constructor(
    private readonly salesService: SalesService,
    private readonly cashDrawerService: PosCashDrawerService,
  ) {}

  async batchSync(
    schemaName: string,
    branchId: string,
    items: BatchSyncSaleItemDto[],
    ctx: {
      actorUserId?: string | null;
      requestUserRole?: string | null;
      permissionCodes?: string[];
    },
  ): Promise<{ results: BatchSyncItemResult[] }> {
    if (!branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }

    const results: BatchSyncItemResult[] = [];

    for (const item of items) {
      const ref = item.clientSaleRef?.trim();
      if (!ref) {
        results.push({
          clientSaleRef: item.clientSaleRef,
          status: 'conflict',
          message: 'clientSaleRef is required',
        });
        continue;
      }

      try {
        const existingBefore = await this.salesService.findByClientSaleRef(
          schemaName,
          branchId,
          ref,
        );

        const sale = await this.salesService.create(
          schemaName,
          branchId,
          {
            ...item.sale,
            clientSaleRef: ref,
            syncSource: 'offline',
          },
          {
            actorUserId: ctx.actorUserId,
            requestUserRole: ctx.requestUserRole,
            permissionCodes: ctx.permissionCodes,
          },
        );

        results.push({
          clientSaleRef: ref,
          status: existingBefore ? 'duplicate' : 'accepted',
          saleId: (sale as { id?: string }).id,
          receiptNumber: (sale as { receipt_number?: string | null })
            .receipt_number,
        });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Sale sync failed';
        if (
          msg.includes('duplicate') ||
          msg.includes('client_sale_ref') ||
          err instanceof ConflictException
        ) {
          results.push({
            clientSaleRef: ref,
            status: 'duplicate',
            message: msg,
          });
          continue;
        }
        if (
          msg.includes('stock') ||
          msg.includes('inventory') ||
          msg.includes('Insufficient')
        ) {
          results.push({
            clientSaleRef: ref,
            status: 'conflict',
            message: msg,
          });
          continue;
        }
        results.push({
          clientSaleRef: ref,
          status: 'conflict',
          message: msg,
        });
      }
    }

    return { results };
  }

  async batchSyncCashMovements(
    schemaName: string,
    branchId: string,
    items: BatchSyncCashMovementItemDto[],
    actorUserId?: string | null,
  ): Promise<{ results: BatchSyncCashResult[] }> {
    if (!branchId) {
      throw new BadRequestException('Branch required (x-branch-id header)');
    }

    const results: BatchSyncCashResult[] = [];

    for (const item of items) {
      const ref = item.clientRef?.trim();
      if (!ref) {
        results.push({
          clientRef: item.clientRef,
          status: 'conflict',
          message: 'clientRef is required',
        });
        continue;
      }

      try {
        const movement = await this.cashDrawerService.createMovement(
          schemaName,
          item.sessionId,
          branchId,
          {
            movementType: item.movementType,
            amount: item.amount,
            reasonCode: item.reasonCode,
            note: item.note,
            clientRef: ref,
          },
          actorUserId ?? null,
        );
        results.push({
          clientRef: ref,
          status: 'accepted',
          movementId: (movement as { id?: string }).id,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Cash movement sync failed';
        if (msg.includes('duplicate') || msg.includes('client_ref')) {
          results.push({ clientRef: ref, status: 'duplicate', message: msg });
          continue;
        }
        results.push({ clientRef: ref, status: 'conflict', message: msg });
      }
    }

    return { results };
  }
}
