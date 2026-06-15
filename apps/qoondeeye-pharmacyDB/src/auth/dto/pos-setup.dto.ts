import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Keep in sync with:
 * packages/validation/src/auth.ts — posSetupSchema
 */
export class PosSetupDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message:
      'Tenant code may only contain letters, numbers, underscores, and hyphens',
  })
  tenantCode?: string;

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
  @IsString()
  @MaxLength(128)
  deviceFingerprint?: string;
}
