import { IsOptional, IsUUID } from 'class-validator';

export class OpenPosSessionDto {
  @IsOptional()
  @IsUUID()
  deviceId?: string;

  @IsOptional()
  @IsUUID()
  staffUserId?: string;
}
