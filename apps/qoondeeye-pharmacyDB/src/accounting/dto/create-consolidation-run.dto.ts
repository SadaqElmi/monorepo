import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ConsolidationFxPolicyDto } from './consolidation-fx-policy.dto';

export class CreateConsolidationRunDto {
  @IsString()
  periodKey!: string;

  @IsDateString()
  asOfDate!: string;

  @IsDateString()
  fromDate!: string;

  @IsDateString()
  toDate!: string;

  @IsString()
  scopeHash!: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  branchIds?: string[];

  @IsOptional()
  @IsUUID('4')
  entityId?: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsBoolean()
  /** When true, persists a draft run (no GL postings). */
  asDraft?: boolean;

  @IsOptional()
  @IsUUID('4')
  /** Deletes this draft before posting (same period/scope as body). */
  replaceDraftRunId?: string;

  @IsOptional()
  @IsDateString()
  asOfFxDate?: string;

  @IsOptional()
  @IsString()
  groupCurrency?: string;

  /** @deprecated Prefer `fxPolicy` (BS/P&amp;L/equity legs). Kept for one release. */
  @IsOptional()
  @IsIn(['closing', 'average', 'historical'])
  ratePolicy?: 'closing' | 'average' | 'historical';

  @IsOptional()
  @ValidateNested()
  @Type(() => ConsolidationFxPolicyDto)
  fxPolicy?: ConsolidationFxPolicyDto;

  @IsOptional()
  @IsBoolean()
  includeAdjustments?: boolean;
}
