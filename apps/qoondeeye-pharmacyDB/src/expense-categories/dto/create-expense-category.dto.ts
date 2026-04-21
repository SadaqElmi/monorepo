import { IsOptional, IsString } from 'class-validator';

export class CreateExpenseCategoryDto {
  @IsOptional()
  @IsString()
  name?: string;

  /** Maps to chart_of_accounts.account_key for this tenant branch when posting expenses. */
  @IsOptional()
  @IsString()
  glAccountKey?: string;
}
