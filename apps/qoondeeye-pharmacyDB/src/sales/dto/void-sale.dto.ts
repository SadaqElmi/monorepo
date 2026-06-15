import { IsUUID } from 'class-validator';

export class VoidSaleDto {
  @IsUUID()
  approvalId!: string;
}
