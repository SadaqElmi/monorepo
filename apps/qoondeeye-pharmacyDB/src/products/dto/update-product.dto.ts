import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  genericName?: string;

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
   */
  @IsOptional()
  @IsString()
  strength?: string;

  @IsOptional()
  @IsString()
  formulation?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsNumber()
  @Min(0)
  listPrice?: number | null;
}
