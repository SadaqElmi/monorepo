import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class ManualJournalLineDto {
  @IsUUID()
  accountId!: string;

  @IsNumber()
  debit!: number;

  @IsNumber()
  credit!: number;
}

export class CreateManualJournalDto {
  @IsUUID()
  branchId!: string;

  @IsDateString()
  entryDate!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => ManualJournalLineDto)
  lines!: ManualJournalLineDto[];
}
