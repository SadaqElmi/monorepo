import {
  IsOptional,
  IsNumber,
  IsUUID,
  IsDateString,
  IsString,
  Min,
} from 'class-validator';

export class UpdatePatientLoanDto {
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  saleId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalAmount?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
