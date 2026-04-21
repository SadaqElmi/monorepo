import { IsOptional, IsString } from 'class-validator';

export class ReverseConsolidationRunDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
