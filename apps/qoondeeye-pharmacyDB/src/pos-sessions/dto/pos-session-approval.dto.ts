import { IsOptional, IsUUID } from 'class-validator';

export class PosSessionVarianceApprovalDto {
  @IsOptional()
  @IsUUID()
  varianceApprovalId?: string;
}
