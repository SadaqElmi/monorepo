import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
} from 'class-validator';

export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  cashierId?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  password?: string;

  @IsOptional()
  @IsString()
  role?: string;

  /** Set new PIN (digits). Send empty string to clear. */
  @IsOptional()
  @IsString()
  @Matches(/^$|^\d{4,12}$/, {
    message: 'PIN must be 4–12 digits or empty to clear',
  })
  pin?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}
