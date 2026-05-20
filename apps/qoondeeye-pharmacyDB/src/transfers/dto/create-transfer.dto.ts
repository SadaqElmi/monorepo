import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { TransferLineDto } from './transfer-line.dto';

/**
 * Keep in sync with:
 * packages/validation/src/transfers.ts — createTransferSchema (camelCase client payload)
 */
export class CreateTransferDto {
  @IsOptional()
  @IsUUID()
  from_branch_id?: string;

  @IsUUID()
  to_branch_id!: string;

  @IsOptional()
  @IsDateString()
  expected_date?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  items!: TransferLineDto[];
}
