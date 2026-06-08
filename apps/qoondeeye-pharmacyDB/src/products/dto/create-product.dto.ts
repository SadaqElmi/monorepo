import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ProductUomSetupDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.000001)
  conversionFactorToBase?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isBase?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isPurchaseDefault?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isSalesDefault?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isPosDefault?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sellingPrice?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costPrice?: number | null;
}

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  name!: string;

  /** When true, product is visible to all branches (branch_id stored as NULL). */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  catalogWide?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  listPrice?: number;

  @IsOptional()
  @IsString()
  genericName?: string;

  @IsOptional()
  @IsString()
  itemNo?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  /**
   * Frontend alias for `barcode`.
   */
  @IsOptional()
  @IsString()
  sku?: string;

  /**
   * Frontend fields (not yet stored in DB schema).
   * Keeping them in DTO avoids validation errors due to strict whitelisting.
   */
  @IsOptional()
  @IsString()
  strength?: string;

  @IsOptional()
  @IsString()
  formulation?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductUomSetupDto)
  uoms?: ProductUomSetupDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  reorderLevel?: number;
}
