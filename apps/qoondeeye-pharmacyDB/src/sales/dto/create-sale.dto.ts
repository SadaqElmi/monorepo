import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  ValidateNested,
  IsOptional,
  IsNumber,
  IsString,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Keep in sync with:
 * packages/validation/src/sales.ts — saleLineSchema
 */
export class CreateSaleItemDto {
  /** Inventory / catalog line — use this or `miscChargeKind`, not both. */
  @IsOptional()
  @IsUUID()
  productId?: string;

  /**
   * Manual POS charge (no stock movement): delivery or tailor only.
   * Member card / points are not posted via sales API yet. Use this or `productId`, not both.
   */
  @IsOptional()
  @IsString()
  @IsIn(['delivery', 'tailor'])
  miscChargeKind?: string;

  @IsInt()
  quantity!: number;

  @IsOptional()
  @IsNumber()
  price?: number;
}

/**
 * Keep in sync with:
 * packages/validation/src/sales.ts — createSaleSchema
 */
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

  /** When set (POS), must reference an open pos_sessions row for this branch. */
  @IsOptional()
  @IsUUID()
  posSessionId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items!: CreateSaleItemDto[];
}
