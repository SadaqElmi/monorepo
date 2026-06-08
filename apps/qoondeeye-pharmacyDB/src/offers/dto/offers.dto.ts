import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class OfferRuleDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  bundleProductIds?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  buyQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  getQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  specialPrice?: number;
}

export class CreateOfferDto {
  @IsOptional()
  @IsString()
  no?: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsOptional()
  @IsIn([
    'percentage',
    'fixed_amount',
    'buy_x_get_y',
    'bundle',
    'special_price',
  ])
  offerType?: string;

  @IsOptional()
  @IsIn(['percentage', 'fixed_amount', 'special_price'])
  discountType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountValue?: number;

  @IsOptional()
  @IsString()
  applyTo?: string;

  @IsOptional()
  @IsUUID()
  priceGroupId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsString()
  validationPeriodId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  stackingEnabled?: boolean;

  @IsOptional()
  @IsArray()
  branchScope?: string[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => OfferRuleDto)
  rules?: OfferRuleDto[];
}

export class UpdateOfferDto {
  @IsOptional()
  @IsString()
  no?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;

  @IsOptional()
  @IsIn(['enabled', 'disabled'])
  status?: string;

  @IsOptional()
  @IsIn([
    'percentage',
    'fixed_amount',
    'buy_x_get_y',
    'bundle',
    'special_price',
  ])
  offerType?: string;

  @IsOptional()
  @IsIn(['percentage', 'fixed_amount', 'special_price'])
  discountType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountValue?: number;

  @IsOptional()
  @IsString()
  applyTo?: string;

  @IsOptional()
  @IsUUID()
  priceGroupId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsString()
  validationPeriodId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  stackingEnabled?: boolean;

  @IsOptional()
  @IsArray()
  branchScope?: string[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => OfferRuleDto)
  rules?: OfferRuleDto[];

}

export class OffersQueryDto {
  @IsOptional()
  @IsIn(['enabled', 'disabled'])
  status?: string;

  @IsOptional()
  @IsUUID()
  priceGroupId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class ResolveOfferDto {
  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  uomId?: string;

  @IsOptional()
  @IsUUID()
  priceGroupId?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice?: number;
}
