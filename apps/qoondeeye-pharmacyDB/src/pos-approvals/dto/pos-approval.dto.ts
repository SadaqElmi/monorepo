import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export const POS_APPROVAL_ACTIONS = [
  'large_discount',
  'price_override',
  'refund',
  'void_sale',
  'shift_reopen',
  'cash_variance',
] as const;

export class RequestPosApprovalDto {
  @IsString()
  @IsIn([...POS_APPROVAL_ACTIONS])
  actionType!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  reasonCode?: string;

  @IsOptional()
  @IsString()
  reasonNote?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class ApprovePosApprovalDto {
  @IsString()
  @MaxLength(8)
  supervisorPin!: string;

  @IsOptional()
  @IsString()
  reasonNote?: string;
}

export class VerifySupervisorPinDto {
  @IsString()
  @MaxLength(32)
  staffId!: string;

  @IsString()
  @MaxLength(8)
  pin!: string;
}

/** POS convenience: create pending request and approve with supervisor PIN in one step. */
export class RequestAndApprovePosApprovalDto extends RequestPosApprovalDto {
  @IsString()
  @MaxLength(8)
  supervisorPin!: string;
}
