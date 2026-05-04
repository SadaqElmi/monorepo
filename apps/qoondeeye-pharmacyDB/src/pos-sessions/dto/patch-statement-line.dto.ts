import { IsNumber } from 'class-validator';

export class PatchStatementLineDto {
  @IsNumber()
  actualAmount!: number;
}
