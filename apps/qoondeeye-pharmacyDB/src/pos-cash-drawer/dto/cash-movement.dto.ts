import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export const CASH_MOVEMENT_TYPES = [
  'cash_in',
  'cash_out',
  'safe_drop',
  'petty_cash',
  'replenishment',
] as const;

export class CreateCashMovementDto {
  @IsString()
  @IsIn([...CASH_MOVEMENT_TYPES])
  movementType!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  reasonCode?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsUUID()
  clientRef?: string;
}
