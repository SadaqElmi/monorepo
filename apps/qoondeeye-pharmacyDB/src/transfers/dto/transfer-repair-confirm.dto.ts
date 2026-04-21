import { IsBoolean } from 'class-validator';

export class TransferRepairConfirmDto {
  @IsBoolean()
  confirm!: boolean;
}
