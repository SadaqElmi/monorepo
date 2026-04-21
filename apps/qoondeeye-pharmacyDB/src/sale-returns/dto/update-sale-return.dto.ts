import { IsOptional, IsString } from 'class-validator';

export class UpdateSaleReturnDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
