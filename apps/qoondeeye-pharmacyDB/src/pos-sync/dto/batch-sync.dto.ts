import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { CreateSaleDto } from '../../sales/dto/create-sale.dto';

export class BatchSyncSaleItemDto {
  @IsUUID()
  clientSaleRef!: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ValidateNested()
  @Type(() => CreateSaleDto)
  sale!: CreateSaleDto;
}

export class BatchSyncDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BatchSyncSaleItemDto)
  sales!: BatchSyncSaleItemDto[];
}
