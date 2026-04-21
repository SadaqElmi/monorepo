import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreatePaymentTermDto {
  @IsUUID()
  branchId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  daysUntilDue?: number;
}
