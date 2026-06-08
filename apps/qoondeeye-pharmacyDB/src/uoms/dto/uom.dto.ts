import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreateUomDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  symbol?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateUomDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  symbol?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpsertProductUomDto {
  @IsUUID()
  uomId!: string;

  @IsNumber()
  @Min(0.000001)
  conversionFactorToBase!: number;

  @IsOptional()
  @IsBoolean()
  isBase?: boolean;

  @IsOptional()
  @IsBoolean()
  isPurchaseDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isSalesDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isPosDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sellingPrice?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number | null;
}

export class UpdateProductUomDto {
  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  conversionFactorToBase?: number;

  @IsOptional()
  @IsBoolean()
  isBase?: boolean;

  @IsOptional()
  @IsBoolean()
  isPurchaseDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isSalesDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isPosDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sellingPrice?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number | null;
}
