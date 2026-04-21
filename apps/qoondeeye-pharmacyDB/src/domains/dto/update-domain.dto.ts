import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateDomainDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  domain?: string;
}
