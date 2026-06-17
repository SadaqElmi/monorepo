import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  POS_TERMINAL_BINDING_STATUSES,
  POS_TERMINAL_STATUSES,
} from '../pos-terminal-status';

export class ListPosTerminalsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  q?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsIn(POS_TERMINAL_STATUSES)
  status?: string;

  @IsOptional()
  @IsIn(POS_TERMINAL_BINDING_STATUSES)
  bindingStatus?: string;
}
