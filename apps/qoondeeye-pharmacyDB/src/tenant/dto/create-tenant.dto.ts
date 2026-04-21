import {
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @MinLength(1)
  name: string;

  /** Primary domain (e.g. pharmacy1.pharmcare.my). SchemaName auto-derived from subdomain. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  domain?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @Matches(/^[a-z0-9_]+$/, {
    message:
      'schemaName must contain only lowercase letters, numbers, and underscores',
  })
  schemaName?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  domains?: string[];
}
