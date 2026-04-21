import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  ValidateNested,
  IsOptional,
  IsNumber,
  IsString,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSaleItemDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  quantity!: number;

  @IsOptional()
  @IsNumber()
  price?: number;
}

export class CreateSaleDto {
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
  @IsString()
  paymentMethod?: string;

  /** When true, posts Dr AR / Cr revenue (requires customerId). No immediate payment row. */
  @IsOptional()
  @IsBoolean()
  onAccount?: boolean;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items!: CreateSaleItemDto[];
}
