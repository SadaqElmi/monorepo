import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @MinLength(1)
  name!: string;

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
  @IsString()
  @MinLength(1)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'slug must contain only lowercase letters, numbers, and underscores',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @Matches(/^[a-z0-9_]+$/, {
    message:
      'subdomain must contain only lowercase letters, numbers, and underscores',
  })
  subdomain?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  customDomain?: string;

  @IsString()
  @MinLength(1)
  ownerName!: string;

  @IsEmail()
  ownerEmail!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  domains?: string[];
}
