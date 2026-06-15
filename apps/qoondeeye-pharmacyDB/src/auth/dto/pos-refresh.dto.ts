import { IsString, MaxLength } from 'class-validator';

export class PosRefreshTokenDto {
  @IsString()
  @MaxLength(128)
  refreshToken!: string;

  @IsString()
  tenantSlug!: string;

  @IsString()
  @MaxLength(128)
  deviceCredential!: string;
}
