import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class CreateSaleReturnItemDto {
  @IsUUID()
  saleItemId!: string;

  @IsInt()
  quantity!: number;
}

export class CreateSaleReturnDto {
  @IsUUID()
  saleId!: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  refundMethod?: string;

  @IsOptional()
  @IsNumber()
  refundAmount?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleReturnItemDto)
  items!: CreateSaleReturnItemDto[];
}
