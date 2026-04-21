import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CustomerPaymentAllocationDto {
  @IsUUID()
  saleId!: string;

  @IsNumber()
  amount!: number;
}

export class CreateCustomerPaymentDto {
  @IsUUID()
  branchId!: string;

  @IsUUID()
  customerId!: string;

  @IsNumber()
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
  @Type(() => CustomerPaymentAllocationDto)
  allocations?: CustomerPaymentAllocationDto[];
}
