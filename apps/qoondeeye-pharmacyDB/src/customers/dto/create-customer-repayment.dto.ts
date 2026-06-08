import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CustomerRepaymentAllocationDto {
  @IsUUID()
  saleId!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;
}

export class CreateCustomerRepaymentDto {
  @IsUUID()
  branchId!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  paymentDate!: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomerRepaymentAllocationDto)
  allocations?: CustomerRepaymentAllocationDto[];
}
