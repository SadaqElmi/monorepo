import { Injectable } from '@nestjs/common';
import { assertJournalLinesWhenRequired } from './accounting-journal-guards';
import { Prisma } from '@prisma/client';
import { ChartOfAccountsSeedService } from './chart-of-accounts-seed.service';
import { JournalService, type JournalLineInput } from './journal.service';
import {
  classifyPaymentMethod,
  normalizePaymentKey,
} from './payment-method.util';

@Injectable()
export class AccountingPostingService {
  constructor(
    private readonly seed: ChartOfAccountsSeedService,
    private readonly journal: JournalService,
  ) {}

  async postSaleJournal(
    tx: Prisma.TransactionClient,
    params: {
      branchId: string;
      saleId: string;
      saleTotal: number;
      paymentMethod: string | null | undefined;
      cogsTotal: number;
      entryDate: Date | string;
      /** When true: Dr AR / Cr revenue (on-account invoice). Requires customerId. */
      useReceivable?: boolean;
      customerId?: string | null;
    },
  ): Promise<void> {
    const {
      branchId,
      saleId,
      saleTotal,
      paymentMethod,
      cogsTotal,
      entryDate,
      useReceivable,
      customerId,
    } = params;
    const accounts = await this.seed.ensureAccountsForBranch(tx, branchId);
    const revenue = round2(saleTotal);
    const cogs = round2(cogsTotal);

    const lines: JournalLineInput[] = [];
    const custId = customerId ?? null;
    const pk: JournalLineInput['partnerKind'] =
      useReceivable && custId ? 'customer' : null;

    if (revenue > 0) {
      if (useReceivable) {
        lines.push({
          accountId: accounts.accounts_receivable,
          debit: revenue,
          credit: 0,
          partnerKind: pk,
          partnerId: custId,
        });
        lines.push({
          accountId: accounts.sales_revenue,
          debit: 0,
          credit: revenue,
          partnerKind: pk,
          partnerId: custId,
        });
      } else {
        const payKey = normalizePaymentKey(paymentMethod);
        const clearingId = this.seed.resolvePaymentAccount(accounts, payKey);
        lines.push({ accountId: clearingId, debit: revenue, credit: 0 });
        lines.push({
          accountId: accounts.sales_revenue,
          debit: 0,
          credit: revenue,
        });
      }
    }

    if (cogs > 0) {
      lines.push({ accountId: accounts.cogs, debit: cogs, credit: 0 });
      lines.push({
        accountId: accounts.inventory,
        debit: 0,
        credit: cogs,
      });
    }

    assertJournalLinesWhenRequired(
      revenue > 0 || cogs > 0,
      lines.length,
      'postSaleJournal',
      saleId,
    );
    if (lines.length === 0) return;

    await this.journal.createBalancedEntry(tx, {
      branchId,
      entryDate,
      description: useReceivable
        ? `Customer invoice ${saleId}`
        : `Sale ${saleId}`,
      sourceType: useReceivable ? 'customer_invoice' : 'sale',
      sourceId: saleId,
      lines,
    });
  }

  async postPurchaseJournal(
    tx: Prisma.TransactionClient,
    params: {
      branchId: string;
      purchaseId: string;
      inventoryTotal: number;
      entryDate: Date | string;
      /** When true, credit Accounts payable instead of Cash. */
      onCredit?: boolean;
      supplierId?: string | null;
    },
  ): Promise<void> {
    const {
      branchId,
      purchaseId,
      inventoryTotal,
      entryDate,
      onCredit,
      supplierId,
    } = params;
    const amt = round2(inventoryTotal);
    if (amt <= 0) return;

    const accounts = await this.seed.ensureAccountsForBranch(tx, branchId);
    const creditAccountId = onCredit
      ? accounts.accounts_payable
      : accounts.cash;
    const supPk: JournalLineInput['partnerKind'] = supplierId
      ? 'supplier'
      : null;
    await this.journal.createBalancedEntry(tx, {
      branchId,
      entryDate,
      description: `Purchase ${purchaseId}`,
      sourceType: 'purchase',
      sourceId: purchaseId,
      lines: [
        {
          accountId: accounts.inventory,
          debit: amt,
          credit: 0,
          partnerKind: supPk,
          partnerId: supplierId ?? null,
        },
        {
          accountId: creditAccountId,
          debit: 0,
          credit: amt,
          partnerKind: supPk,
          partnerId: supplierId ?? null,
        },
      ],
    });
  }

  /** Undo inventory/AP or cash effect when a purchase is voided. */
  async reversePurchaseJournal(
    tx: Prisma.TransactionClient,
    params: {
      branchId: string;
      purchaseId: string;
      inventoryTotal: number;
      entryDate: Date | string;
      onCredit?: boolean;
      supplierId?: string | null;
    },
  ): Promise<void> {
    const {
      branchId,
      purchaseId,
      inventoryTotal,
      entryDate,
      onCredit,
      supplierId,
    } = params;
    const amt = round2(inventoryTotal);
    if (amt <= 0) return;

    const accounts = await this.seed.ensureAccountsForBranch(tx, branchId);
    const originalCreditAccountId = onCredit
      ? accounts.accounts_payable
      : accounts.cash;
    const supPk: JournalLineInput['partnerKind'] = supplierId
      ? 'supplier'
      : null;
    await this.journal.createBalancedEntry(tx, {
      branchId,
      entryDate,
      description: `Void purchase ${purchaseId}`,
      sourceType: 'purchase_reversal',
      sourceId: purchaseId,
      lines: [
        {
          accountId: originalCreditAccountId,
          debit: amt,
          credit: 0,
          partnerKind: supPk,
          partnerId: supplierId ?? null,
        },
        {
          accountId: accounts.inventory,
          debit: 0,
          credit: amt,
          partnerKind: supPk,
          partnerId: supplierId ?? null,
        },
      ],
    });
  }

  /**
   * Supplier credit / return (financial): reverse part of a purchase without deleting the row.
   * Dr AP or Cash (original settlement) / Cr Inventory — same shape as reversal.
   */
  async postPurchaseRefundJournal(
    tx: Prisma.TransactionClient,
    params: {
      branchId: string;
      refundId: string;
      amount: number;
      entryDate: Date | string;
      onCredit: boolean;
      supplierId?: string | null;
    },
  ): Promise<void> {
    const { branchId, refundId, amount, entryDate, onCredit, supplierId } =
      params;
    const amt = round2(amount);
    if (amt <= 0) return;

    const accounts = await this.seed.ensureAccountsForBranch(tx, branchId);
    const creditAccountId = onCredit
      ? accounts.accounts_payable
      : accounts.cash;
    const supPk: JournalLineInput['partnerKind'] = supplierId
      ? 'supplier'
      : null;
    await this.journal.createBalancedEntry(tx, {
      branchId,
      entryDate,
      description: `Purchase refund ${refundId}`,
      sourceType: 'purchase_refund',
      sourceId: refundId,
      lines: [
        {
          accountId: creditAccountId,
          debit: amt,
          credit: 0,
          partnerKind: supPk,
          partnerId: supplierId ?? null,
        },
        {
          accountId: accounts.inventory,
          debit: 0,
          credit: amt,
          partnerKind: supPk,
          partnerId: supplierId ?? null,
        },
      ],
    });
  }

  /**
   * Pay a supplier: Dr Accounts payable / Cr Cash or Bank (or card clearing if labeled as card).
   */
  async postApPaymentJournal(
    tx: Prisma.TransactionClient,
    params: {
      branchId: string;
      paymentId: string;
      amount: number;
      entryDate: Date | string;
      paymentMethod: string | null | undefined;
      supplierId?: string | null;
    },
  ): Promise<void> {
    const {
      branchId,
      paymentId,
      amount,
      entryDate,
      paymentMethod,
      supplierId,
    } = params;
    const amt = round2(amount);
    if (amt <= 0) return;

    const accounts = await this.seed.ensureAccountsForBranch(tx, branchId);
    const bucket = classifyPaymentMethod(paymentMethod);
    const creditAccountId = this.seed.resolvePaymentAccount(accounts, bucket);
    const supPk: JournalLineInput['partnerKind'] = supplierId
      ? 'supplier'
      : null;

    await this.journal.createBalancedEntry(tx, {
      branchId,
      entryDate,
      description: `Supplier payment ${paymentId}`,
      sourceType: 'ap_payment',
      sourceId: paymentId,
      lines: [
        {
          accountId: accounts.accounts_payable,
          debit: amt,
          credit: 0,
          partnerKind: supPk,
          partnerId: supplierId ?? null,
        },
        {
          accountId: creditAccountId,
          debit: 0,
          credit: amt,
          partnerKind: supPk,
          partnerId: supplierId ?? null,
        },
      ],
    });
  }

  /** Customer receipt: Dr Cash/Bank/Card / Cr Accounts receivable */
  async postArPaymentJournal(
    tx: Prisma.TransactionClient,
    params: {
      branchId: string;
      paymentId: string;
      amount: number;
      entryDate: Date | string;
      paymentMethod: string | null | undefined;
      customerId: string;
    },
  ): Promise<void> {
    const {
      branchId,
      paymentId,
      amount,
      entryDate,
      paymentMethod,
      customerId,
    } = params;
    const amt = round2(amount);
    if (amt <= 0) return;

    const accounts = await this.seed.ensureAccountsForBranch(tx, branchId);
    const bucket = classifyPaymentMethod(paymentMethod);
    const debitAccountId = this.seed.resolvePaymentAccount(accounts, bucket);

    await this.journal.createBalancedEntry(tx, {
      branchId,
      entryDate,
      description: `Customer payment ${paymentId}`,
      sourceType: 'ar_payment',
      sourceId: paymentId,
      lines: [
        {
          accountId: debitAccountId,
          debit: amt,
          credit: 0,
          partnerKind: 'customer',
          partnerId: customerId,
        },
        {
          accountId: accounts.accounts_receivable,
          debit: 0,
          credit: amt,
          partnerKind: 'customer',
          partnerId: customerId,
        },
      ],
    });
  }

  async postSaleReturnJournal(
    tx: Prisma.TransactionClient,
    params: {
      branchId: string;
      saleReturnId: string;
      refundAmount: number;
      refundMethod: string | null | undefined;
      cogsReversalTotal: number;
      entryDate: Date | string;
      /** When true, credit AR instead of cash/bank (original sale was on account). */
      creditToReceivable?: boolean;
      customerId?: string | null;
    },
  ): Promise<void> {
    const {
      branchId,
      saleReturnId,
      refundAmount,
      refundMethod,
      cogsReversalTotal,
      entryDate,
      creditToReceivable,
      customerId,
    } = params;
    const refund = round2(refundAmount);
    const cogsRev = round2(cogsReversalTotal);
    const accounts = await this.seed.ensureAccountsForBranch(tx, branchId);

    const lines: JournalLineInput[] = [];
    const custId = customerId ?? null;
    const pk: JournalLineInput['partnerKind'] =
      creditToReceivable && custId ? 'customer' : null;

    if (refund > 0) {
      lines.push({
        accountId: accounts.sales_revenue,
        debit: refund,
        credit: 0,
        partnerKind: pk,
        partnerId: custId,
      });
      if (creditToReceivable && custId) {
        lines.push({
          accountId: accounts.accounts_receivable,
          debit: 0,
          credit: refund,
          partnerKind: pk,
          partnerId: custId,
        });
      } else {
        const payKey = normalizePaymentKey(refundMethod);
        const clearingId = this.seed.resolvePaymentAccount(accounts, payKey);
        lines.push({ accountId: clearingId, debit: 0, credit: refund });
      }
    }

    if (cogsRev > 0) {
      lines.push({
        accountId: accounts.inventory,
        debit: cogsRev,
        credit: 0,
        partnerKind: pk,
        partnerId: custId,
      });
      lines.push({
        accountId: accounts.cogs,
        debit: 0,
        credit: cogsRev,
        partnerKind: pk,
        partnerId: custId,
      });
    }

    assertJournalLinesWhenRequired(
      refund > 0 || cogsRev > 0,
      lines.length,
      'postSaleReturnJournal',
      saleReturnId,
    );
    if (lines.length === 0) return;

    await this.journal.createBalancedEntry(tx, {
      branchId,
      entryDate,
      description: `Sale return ${saleReturnId}`,
      sourceType: 'sale_return',
      sourceId: saleReturnId,
      lines,
    });
  }

  /**
   * Undo GL effect of a sale return (e.g. when voiding the return document).
   * Mirrors {@link postSaleReturnJournal} with debits and credits inverted.
   */
  async postSaleReturnReversalJournal(
    tx: Prisma.TransactionClient,
    params: {
      branchId: string;
      saleReturnId: string;
      refundAmount: number;
      refundMethod: string | null | undefined;
      cogsReversalTotal: number;
      entryDate: Date | string;
      creditToReceivable?: boolean;
      customerId?: string | null;
    },
  ): Promise<void> {
    const {
      branchId,
      saleReturnId,
      refundAmount,
      refundMethod,
      cogsReversalTotal,
      entryDate,
      creditToReceivable,
      customerId,
    } = params;
    const refund = round2(refundAmount);
    const cogsRev = round2(cogsReversalTotal);
    const accounts = await this.seed.ensureAccountsForBranch(tx, branchId);

    const lines: JournalLineInput[] = [];
    const custId = customerId ?? null;
    const pk: JournalLineInput['partnerKind'] =
      creditToReceivable && custId ? 'customer' : null;

    if (refund > 0) {
      if (creditToReceivable && custId) {
        lines.push({
          accountId: accounts.accounts_receivable,
          debit: refund,
          credit: 0,
          partnerKind: pk,
          partnerId: custId,
        });
        lines.push({
          accountId: accounts.sales_revenue,
          debit: 0,
          credit: refund,
          partnerKind: pk,
          partnerId: custId,
        });
      } else {
        const payKey = normalizePaymentKey(refundMethod);
        const clearingId = this.seed.resolvePaymentAccount(accounts, payKey);
        lines.push({ accountId: clearingId, debit: refund, credit: 0 });
        lines.push({
          accountId: accounts.sales_revenue,
          debit: 0,
          credit: refund,
        });
      }
    }

    if (cogsRev > 0) {
      lines.push({
        accountId: accounts.cogs,
        debit: cogsRev,
        credit: 0,
        partnerKind: pk,
        partnerId: custId,
      });
      lines.push({
        accountId: accounts.inventory,
        debit: 0,
        credit: cogsRev,
        partnerKind: pk,
        partnerId: custId,
      });
    }

    assertJournalLinesWhenRequired(
      refund > 0 || cogsRev > 0,
      lines.length,
      'postSaleReturnReversalJournal',
      saleReturnId,
    );
    if (lines.length === 0) return;

    await this.journal.createBalancedEntry(tx, {
      branchId,
      entryDate,
      description: `Void sale return ${saleReturnId}`,
      sourceType: 'sale_return_reversal',
      sourceId: saleReturnId,
      lines,
    });
  }

  /** Undo a posted operating expense (Dr cash / Cr original expense account). */
  async reverseExpenseJournal(
    tx: Prisma.TransactionClient,
    params: {
      branchId: string;
      expenseId: string;
      amount: number;
      entryDate: Date | string;
      expenseAccountKey?: string | null;
    },
  ): Promise<void> {
    const { branchId, expenseId, amount, entryDate, expenseAccountKey } =
      params;
    const amt = round2(amount);
    if (amt <= 0) return;

    const accounts = await this.seed.ensureAccountsForBranch(tx, branchId);
    let creditAccountId = accounts.operating_expense;
    if (expenseAccountKey) {
      const [row] = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM chart_of_accounts
         WHERE branch_id = $1::uuid AND account_key = $2`,
        branchId,
        expenseAccountKey,
      );
      if (row?.id) creditAccountId = row.id;
    }
    await this.journal.createBalancedEntry(tx, {
      branchId,
      entryDate,
      description: `Void expense ${expenseId}`,
      sourceType: 'expense_reversal',
      sourceId: expenseId,
      lines: [
        { accountId: accounts.cash, debit: amt, credit: 0 },
        { accountId: creditAccountId, debit: 0, credit: amt },
      ],
    });
  }

  async postTransferShipJournal(
    tx: Prisma.TransactionClient,
    params: {
      branchId: string;
      transferId: string;
      amount: number;
      entryDate: Date | string;
      sourceBranchId: string;
      destinationBranchId: string;
    },
  ): Promise<{ id: string } | null> {
    const {
      branchId,
      transferId,
      amount,
      entryDate,
      sourceBranchId,
      destinationBranchId,
    } = params;
    const amt = round2(amount);
    if (amt <= 0) return null;

    const accounts = await this.seed.ensureAccountsForBranch(tx, branchId);
    return this.journal.createBalancedEntry(tx, {
      branchId,
      entryDate,
      description: `Transfer ship ${transferId} (${sourceBranchId} -> ${destinationBranchId})`,
      sourceType: 'transfer_ship',
      sourceId: transferId,
      lines: [
        {
          accountId: accounts.due_from_branch,
          debit: amt,
          credit: 0,
        },
        {
          accountId: accounts.inventory,
          debit: 0,
          credit: amt,
        },
      ],
    });
  }

  async postTransferReceiveJournal(
    tx: Prisma.TransactionClient,
    params: {
      branchId: string;
      transferId: string;
      amount: number;
      entryDate: Date | string;
      sourceBranchId: string;
      destinationBranchId: string;
    },
  ): Promise<{ id: string } | null> {
    const {
      branchId,
      transferId,
      amount,
      entryDate,
      sourceBranchId,
      destinationBranchId,
    } = params;
    const amt = round2(amount);
    if (amt <= 0) return null;

    const accounts = await this.seed.ensureAccountsForBranch(tx, branchId);
    return this.journal.createBalancedEntry(tx, {
      branchId,
      entryDate,
      description: `Transfer receive ${transferId} (${sourceBranchId} -> ${destinationBranchId})`,
      sourceType: 'transfer_receive',
      sourceId: transferId,
      lines: [
        {
          accountId: accounts.inventory,
          debit: amt,
          credit: 0,
        },
        {
          accountId: accounts.due_to_branch,
          debit: 0,
          credit: amt,
        },
      ],
    });
  }

  async postTransferShipReversalJournal(
    tx: Prisma.TransactionClient,
    params: {
      branchId: string;
      transferId: string;
      amount: number;
      entryDate: Date | string;
      sourceBranchId: string;
      destinationBranchId: string;
    },
  ): Promise<{ id: string } | null> {
    const {
      branchId,
      transferId,
      amount,
      entryDate,
      sourceBranchId,
      destinationBranchId,
    } = params;
    const amt = round2(amount);
    if (amt <= 0) return null;

    const accounts = await this.seed.ensureAccountsForBranch(tx, branchId);
    return this.journal.createBalancedEntry(tx, {
      branchId,
      entryDate,
      description: `Transfer ship reversal ${transferId} (${sourceBranchId} -> ${destinationBranchId})`,
      sourceType: 'transfer_ship_reversal',
      sourceId: transferId,
      lines: [
        {
          accountId: accounts.inventory,
          debit: amt,
          credit: 0,
        },
        {
          accountId: accounts.due_from_branch,
          debit: 0,
          credit: amt,
        },
      ],
    });
  }

  async postTransferReceiveReversalJournal(
    tx: Prisma.TransactionClient,
    params: {
      branchId: string;
      transferId: string;
      amount: number;
      entryDate: Date | string;
      sourceBranchId: string;
      destinationBranchId: string;
    },
  ): Promise<{ id: string } | null> {
    const {
      branchId,
      transferId,
      amount,
      entryDate,
      sourceBranchId,
      destinationBranchId,
    } = params;
    const amt = round2(amount);
    if (amt <= 0) return null;

    const accounts = await this.seed.ensureAccountsForBranch(tx, branchId);
    return this.journal.createBalancedEntry(tx, {
      branchId,
      entryDate,
      description: `Transfer receive reversal ${transferId} (${sourceBranchId} -> ${destinationBranchId})`,
      sourceType: 'transfer_receive_reversal',
      sourceId: transferId,
      lines: [
        {
          accountId: accounts.due_to_branch,
          debit: amt,
          credit: 0,
        },
        {
          accountId: accounts.inventory,
          debit: 0,
          credit: amt,
        },
      ],
    });
  }

  async postExpenseJournal(
    tx: Prisma.TransactionClient,
    params: {
      branchId: string;
      expenseId: string;
      amount: number;
      entryDate: Date | string;
      /** Resolved from expense_categories.gl_account_key when set. */
      expenseAccountKey?: string | null;
    },
  ): Promise<void> {
    const { branchId, expenseId, amount, entryDate, expenseAccountKey } =
      params;
    const amt = round2(amount);
    if (amt <= 0) return;

    const accounts = await this.seed.ensureAccountsForBranch(tx, branchId);
    let debitAccountId = accounts.operating_expense;
    if (expenseAccountKey) {
      const [row] = await tx.$queryRawUnsafe<{ id: string }[]>(
        `SELECT id FROM chart_of_accounts
         WHERE branch_id = $1::uuid AND account_key = $2`,
        branchId,
        expenseAccountKey,
      );
      if (row?.id) debitAccountId = row.id;
    }
    await this.journal.createBalancedEntry(tx, {
      branchId,
      entryDate,
      description: `Expense ${expenseId}`,
      sourceType: 'expense',
      sourceId: expenseId,
      lines: [
        { accountId: debitAccountId, debit: amt, credit: 0 },
        { accountId: accounts.cash, debit: 0, credit: amt },
      ],
    });
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
