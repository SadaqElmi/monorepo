import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateStaffDto {
  @IsOptional()
  @IsString()
  name?: string;

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

  /** Digits only; for cashier POS login */
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  @Matches(/^\d+$/, { message: 'PIN must contain digits only' })
  pin?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}
