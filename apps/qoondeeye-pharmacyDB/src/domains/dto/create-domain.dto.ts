import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateDomainDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @MinLength(1)
  domain!: string;
}
