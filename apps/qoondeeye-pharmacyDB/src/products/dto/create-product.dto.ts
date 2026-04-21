import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  name: string;

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
}
