import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class ActivateAdminTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  ownerName?: string;

  @IsOptional()
  @IsEmail()
  ownerEmail?: string;
}
