import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { POS_TERMINAL_STATUSES } from '../pos-terminal-status';

export class CreatePosTerminalDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  displayName!: string;

  @IsUUID()
  branchId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message:
      'Terminal username may only contain letters, numbers, underscores, and hyphens',
  })
  terminalUsername!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsIn(POS_TERMINAL_STATUSES)
  status?: (typeof POS_TERMINAL_STATUSES)[number];
}
