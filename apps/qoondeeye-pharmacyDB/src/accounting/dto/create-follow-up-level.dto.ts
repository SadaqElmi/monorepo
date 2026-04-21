import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateFollowUpLevelDto {
  @IsUUID()
  branchId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  daysAfterDue?: number;
}
