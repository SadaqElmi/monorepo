import { IsOptional, IsString, IsIn, MinLength } from 'class-validator';

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn([
    'pending_setup',
    'active',
    'suspended',
    'inactive',
    'provisioning_failed',
    'migration_failed',
  ])
  status?: string;
}
