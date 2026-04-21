import {
  ArrayMinSize,
  IsArray,
  IsInt,
  ValidateNested,
  IsOptional,
  IsNumber,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

class UpdateSaleItemDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  quantity!: number;

  @IsOptional()
  @IsNumber()
  price?: number;
}

export class UpdateSaleDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsNumber()
  totalAmount?: number;

  @IsOptional()
  @IsNumber()
  discount?: number;

  @IsOptional()
  @IsNumber()
  tax?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateSaleItemDto)
  items?: UpdateSaleItemDto[];
}
