import { IsIn } from 'class-validator';

/**
 * Keep in sync with:
 * packages/validation/src/accounting/consolidation.ts — consolidationFxPolicySchema
 */
export class ConsolidationFxPolicyDto {
  @IsIn(['closing', 'average', 'historical'])
  bs!: 'closing' | 'average' | 'historical';

  @IsIn(['closing', 'average', 'historical'])
  pnl!: 'closing' | 'average' | 'historical';

  @IsIn(['closing', 'average', 'historical'])
  equity!: 'closing' | 'average' | 'historical';
}
