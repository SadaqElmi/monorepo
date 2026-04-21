import { Type } from 'class-transformer';
import { IsInt, IsUUID, Min } from 'class-validator';

export class TransferLineDto {
  @IsUUID()
  product_id: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;
}
