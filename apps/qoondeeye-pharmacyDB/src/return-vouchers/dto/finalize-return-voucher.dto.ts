import { IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class FinalizeReturnVoucherDto {
  @IsString()
  token!: string;

  @IsUUID()
  confirmedProductId!: string;

  /** Optional: must match voucher unit price (within tolerance) when provided */
  @IsOptional()
  @IsNumber()
  scannedUnitPrice?: number;

  @IsString()
  refundMethod!: string;
}
