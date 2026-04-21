import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  LoginDto,
  PinLoginDto,
  RegisterDto,
  SuperAdminSignUpDto,
  SuperAdminLoginDto,
  TenantSignUpDto,
  TenantLoginDto,
} from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ----- Unified auth (single login / signup) -----

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login({
      email: dto.email,
      password: dto.password,
      tenant: dto.tenant,
    });
  }

  @Post('pin-login')
  pinLogin(@Body() dto: PinLoginDto) {
    return this.authService.pinLogin({
      pin: dto.pin,
      tenant: dto.tenant,
      branchId: dto.branchId,
    });
  }

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register({
      pharmacy_name: dto.pharmacy_name,
      owner_name: dto.owner_name,
      email: dto.email,
      password: dto.password,
      phone: dto.phone,
    });
  }

  // ----- Legacy (kept for backward compatibility) -----

  @Post('super-admin/signup')
  superAdminSignUp(@Body() dto: SuperAdminSignUpDto) {
    return this.authService.superAdminSignUp(dto);
  }

  @Post('super-admin/login')
  superAdminLogin(@Body() dto: SuperAdminLoginDto) {
    return this.authService.superAdminLogin(dto);
  }

  @Post('tenant/signup')
  tenantSignUp(@Body() dto: TenantSignUpDto) {
    return this.authService.tenantSignUp(dto);
  }

  @Post('tenant/login')
  tenantLogin(@Body() dto: TenantLoginDto) {
    return this.authService.tenantLogin(dto);
  }
}
