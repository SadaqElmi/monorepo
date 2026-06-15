import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { POS_TERMINAL_STATUSES } from '../pos-terminal-status';

export class UpdatePosTerminalDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  displayName?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsIn(POS_TERMINAL_STATUSES)
  status?: (typeof POS_TERMINAL_STATUSES)[number];
}
