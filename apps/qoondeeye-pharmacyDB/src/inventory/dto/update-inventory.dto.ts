import { IsOptional, IsNumber } from 'class-validator';

export class UpdateInventoryDto {
  @IsOptional()
  @IsNumber()
  reorderLevel?: number;
}
