import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateReportExportJobDto {
  @IsIn(['profit_loss', 'balance_sheet', 'cash_flow'])
  reportType!: 'profit_loss' | 'balance_sheet' | 'cash_flow';

  @IsIn(['pdf', 'xlsx'])
  format!: 'pdf' | 'xlsx';

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  asOf?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  /** Comma-separated branch UUIDs (same convention as report GET). */
  @IsOptional()
  @IsString()
  branchIds?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  aggregateAll?: boolean;

  @IsOptional()
  @IsString()
  scopeHash?: string;

  /** Multi-branch balance sheet only: eliminate inter-branch due from/to in export. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  consolidated?: boolean;
}
