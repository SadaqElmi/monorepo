import {
  ArrayMinSize,
  IsArray,
  IsInt,
  ValidateNested,
  IsOptional,
  IsString,
  IsNumber,
  IsUUID,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Keep in sync with:
 * packages/validation/src/purchases.ts — purchaseLineSchema
 */
export class CreatePurchaseItemDto {
  @IsUUID()
  productId!: string;

  @IsInt()
  quantity!: number;

  @IsOptional()
  @IsString()
  batchNumber?: string;

  @IsOptional()
  @IsNumber()
  costPrice?: number;

  @IsOptional()
  @IsNumber()
  sellingPrice?: number;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}

/**
 * Keep in sync with:
 * packages/validation/src/purchases.ts — createPurchaseSchema
 */
export class CreatePurchaseDto {
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @IsOptional()
  @IsNumber()
  totalAmount?: number;

  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  /** When true, journal credits Accounts payable instead of Cash. */
  @IsOptional()
  @IsBoolean()
  onCredit?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseItemDto)
  items!: CreatePurchaseItemDto[];
}
