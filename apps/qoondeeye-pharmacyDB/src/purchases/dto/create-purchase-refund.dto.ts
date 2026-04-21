import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreatePurchaseRefundDto {
  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsString()
  refundDate?: string;

  /** Match original bill: credit AP vs credit cash */
  @IsOptional()
  @IsBoolean()
  onCredit?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
