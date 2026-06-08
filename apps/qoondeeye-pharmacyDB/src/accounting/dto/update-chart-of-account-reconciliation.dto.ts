import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateChartOfAccountReconciliationDto {
  @IsOptional()
  @IsBoolean()
  allowReconciliation?: boolean;

  @IsOptional()
  @IsBoolean()
  allow_reconciliation?: boolean;
}
