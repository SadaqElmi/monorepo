import { IsOptional, IsUUID } from 'class-validator';

export class CurrentPosSessionQueryDto {
  @IsOptional()
  @IsUUID()
  deviceId?: string;
}
