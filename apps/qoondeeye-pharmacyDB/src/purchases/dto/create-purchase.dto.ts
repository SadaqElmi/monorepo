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
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Keep in sync with:
 * packages/validation/src/purchases.ts — purchaseLineSchema
 */
export class CreatePurchaseItemDto {
  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  uomId?: string;

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
  @IsBoolean()
  updateSellingPrice?: boolean;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @IsNumber()
  lineDiscount?: number;

  @IsOptional()
  @IsNumber()
  taxAmount?: number;

  @IsOptional()
  @IsString()
  lineNotes?: string;
}

/**
 * Keep in sync with:
 * packages/validation/src/purchases.ts — createPurchaseSchema
 */
export class CreatePurchaseDto {
  @IsOptional()
  @IsIn(['immediate', 'draft'])
  workflow?: 'immediate' | 'draft';

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
  @IsString()
  supplierInvoiceNo?: string;

  @IsOptional()
  @IsString()
  purchaseOrderNo?: string;

  @IsOptional()
  @IsNumber()
  totalAmount?: number;

  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @IsOptional()
  @IsDateString()
  orderDate?: string;

  @IsOptional()
  @IsDateString()
  postingDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

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
