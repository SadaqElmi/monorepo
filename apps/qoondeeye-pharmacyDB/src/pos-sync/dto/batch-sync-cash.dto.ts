import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class BatchSyncCashMovementItemDto {
  @IsUUID()
  clientRef!: string;

  @IsUUID()
  sessionId!: string;

  @IsString()
  @MaxLength(32)
  movementType!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  reasonCode?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class BatchSyncCashMovementsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BatchSyncCashMovementItemDto)
  movements!: BatchSyncCashMovementItemDto[];
}
