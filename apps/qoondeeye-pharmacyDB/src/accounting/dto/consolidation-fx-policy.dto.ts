import { IsIn } from 'class-validator';

export class ConsolidationFxPolicyDto {
  @IsIn(['closing', 'average', 'historical'])
  bs!: 'closing' | 'average' | 'historical';

  @IsIn(['closing', 'average', 'historical'])
  pnl!: 'closing' | 'average' | 'historical';

  @IsIn(['closing', 'average', 'historical'])
  equity!: 'closing' | 'average' | 'historical';
}
