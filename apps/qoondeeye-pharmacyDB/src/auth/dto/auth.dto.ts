import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Unified login: email + password; optional tenant for pharmacy users */
export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  tenant?: string;
}

/** Cashier fast login: PIN + pharmacy slug (and optional branch) */
export class PinLoginDto {
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  @Matches(/^\d+$/, { message: 'PIN must contain digits only' })
  pin: string;

  @IsString()
  @MinLength(1)
  tenant: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}

/** Device-bound cashier login: cashier identifier + PIN + device credential */
export class CashierLoginDto {
  @IsString()
  @MinLength(1)
  cashierId: string;

  @IsString()
  @MinLength(4)
  @MaxLength(12)
  @Matches(/^\d+$/, { message: 'PIN must contain digits only' })
  pin: string;

  @IsString()
  @MinLength(1)
  deviceCredential: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}

/** Manager enrollment for POS device binding */
export class PosDeviceEnrollDto {
  @IsString()
  @MinLength(1)
  tenant: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  deviceCode?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  displayName?: string;

  @IsOptional()
  @IsUUID()
  branchId?: string;
}

export class PosDeviceRevokeDto {
  @IsString()
  @MinLength(1)
  tenant: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @MinLength(1)
  deviceCode: string;
}

/** Pharmacy owner signup: creates tenant + first user (admin) */
export class RegisterDto {
  @IsString()
  pharmacy_name: string;

  @IsString()
  owner_name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;
}

// ----- Legacy DTOs (kept for backward compatibility) -----

export class SuperAdminSignUpDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  name?: string;
}

export class SuperAdminLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}

export class TenantSignUpDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  roleName?: string;
}

export class TenantLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}
