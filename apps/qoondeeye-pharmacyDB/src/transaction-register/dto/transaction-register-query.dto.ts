import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export const TRANSACTION_REGISTER_SORT_COLUMNS = [
  'transaction_no',
  'transaction_at',
  'store_no',
  'terminal_no',
  'staff_id',
  'net_amount',
] as const;

export type TransactionRegisterSortColumn =
  (typeof TRANSACTION_REGISTER_SORT_COLUMNS)[number];

export class TransactionRegisterQueryDto {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsString()
  date_from?: string;

  @IsOptional()
  @IsString()
  date_to?: string;

  @IsOptional()
  @IsUUID()
  branch_id?: string;

  @IsOptional()
  @IsUUID()
  terminal_id?: string;

  @IsOptional()
  @IsUUID()
  staff_id?: string;

  @IsOptional()
  @IsString()
  receipt_no?: string;

  @IsOptional()
  @IsString()
  transaction_no?: string;

  @IsOptional()
  @IsUUID()
  customer_id?: string;

  @IsOptional()
  @IsString()
  customer_q?: string;

  @IsOptional()
  @IsIn(['sale', 'refund'])
  transaction_type?: 'sale' | 'refund';

  @IsOptional()
  @IsIn(['none', 'partial', 'full'])
  refund_status?: 'none' | 'partial' | 'full';

  @IsOptional()
  @IsUUID()
  statement_id?: string;

  @IsOptional()
  @IsUUID()
  manager_id?: string;

  @IsOptional()
  @IsIn([...TRANSACTION_REGISTER_SORT_COLUMNS])
  sort_by?: TransactionRegisterSortColumn;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sort_dir?: 'asc' | 'desc';
}

export class TransactionRegisterExportQueryDto extends TransactionRegisterQueryDto {
  @IsIn(['csv', 'xlsx'])
  format!: 'csv' | 'xlsx';
}
