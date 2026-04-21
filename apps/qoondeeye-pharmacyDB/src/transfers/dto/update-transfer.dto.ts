import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { TransferLineDto } from './transfer-line.dto';

export class UpdateTransferDto {
  @IsOptional()
  @IsUUID()
  from_branch_id?: string;

  @IsOptional()
  @IsUUID()
  to_branch_id?: string;

  @IsOptional()
  @IsDateString()
  expected_date?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  items?: TransferLineDto[];
}
