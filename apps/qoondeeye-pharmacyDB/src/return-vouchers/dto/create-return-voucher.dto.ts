import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateReturnVoucherDto {
  @IsUUID()
  saleId!: string;

  @IsUUID()
  saleItemId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
