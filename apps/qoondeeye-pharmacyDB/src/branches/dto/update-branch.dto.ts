import { IsOptional, IsString, Matches, ValidateIf } from 'class-validator';

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  /**
   * Inclusive lock: no postings on or before this date (YYYY-MM-DD).
   * Send null or "" to clear the lock; omit to leave unchanged.
   */
  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== '')
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  accountingLockDate?: string | null;
}
