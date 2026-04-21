import { IsUUID } from 'class-validator';

export class MergeChartOfAccountsDto {
  @IsUUID()
  branchId!: string;

  /** Row to remove after repointing references (duplicate / legacy). */
  @IsUUID()
  sourceAccountId!: string;

  /** Canonical row to keep (must match branch_id and account_key with source). */
  @IsUUID()
  targetAccountId!: string;
}
