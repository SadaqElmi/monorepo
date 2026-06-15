import { IsEmail, IsString, MinLength } from 'class-validator';

export class AssignTenantOwnerDto {
  @IsString()
  @MinLength(1)
  ownerName!: string;

  @IsEmail()
  ownerEmail!: string;
}
