import { Type } from 'class-transformer';
import { IsInt, IsUUID, Min } from 'class-validator';

/**
 * Keep in sync with:
 * packages/validation/src/transfers.ts — transferLineSchema (camelCase: productId)
 */
export class TransferLineDto {
  @IsUUID()
  product_id!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}
