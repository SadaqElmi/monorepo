import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateSupplierPaymentDto {
  @IsUUID()
  branchId!: string;

  @IsUUID()
  supplierId!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  /** YYYY-MM-DD */
  @IsString()
  paymentDate!: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Free text; used with classifyPaymentMethod for cash vs bank vs wallet vs card. */
  @IsOptional()
  @IsString()
  paymentMethod?: string;
}
