import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class PosHeartbeatDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceModel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  osVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  browserVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  appVersion?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  pendingOutboxCount?: number;
}
