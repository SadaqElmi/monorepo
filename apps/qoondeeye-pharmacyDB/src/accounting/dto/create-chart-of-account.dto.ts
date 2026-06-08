import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateChartOfAccountDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  accountType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  account_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  accountKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  account_key?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  description?: string;
}
