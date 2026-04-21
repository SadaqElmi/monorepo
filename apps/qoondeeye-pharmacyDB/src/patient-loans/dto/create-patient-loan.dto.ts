import {
  IsOptional,
  IsNumber,
  IsUUID,
  IsDateString,
  IsString,
  Min,
} from 'class-validator';

export class CreatePatientLoanDto {
  @IsUUID()
  customerId: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  saleId?: string;

  @IsNumber()
  @Min(0)
  totalAmount: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amountPaid?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
