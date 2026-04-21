import { IsOptional, IsNumber, IsUUID } from 'class-validator';

export class CreateInventoryDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsNumber()
  quantity?: number;

  @IsOptional()
  @IsNumber()
  reorderLevel?: number;
}
