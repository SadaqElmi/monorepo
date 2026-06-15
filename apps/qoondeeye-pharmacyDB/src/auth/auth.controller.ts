import { Body, Controller, Get, Headers, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AuthService } from './auth.service';
import {
  StaffLoginDto,
  LoginDto,
  RegisterDto,
  SuperAdminSignUpDto,
  SuperAdminLoginDto,
  TenantSignUpDto,
  TenantLoginDto,
} from './dto/auth.dto';
import { PosSetupDto } from './dto/pos-setup.dto';
import { PosRefreshTokenDto } from './dto/pos-refresh.dto';

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

  @Post('staff-login')
  staffLogin(@Body() dto: StaffLoginDto) {
    return this.authService.staffLogin({
      staffId: dto.staffId,
      pin: dto.pin,
      deviceCredential: dto.deviceCredential,
      branchId: dto.branchId,
    });
  }

  @Post('pos/setup')
  setupPosTerminal(@Body() dto: PosSetupDto, @Req() req: FastifyRequest) {
    return this.authService.setupPosTerminal({
      terminalUsername: dto.terminalUsername,
      password: dto.password,
      tenantCode: dto.tenantCode,
      deviceFingerprint: dto.deviceFingerprint,
      clientIp: req.ip,
    });
  }

  @Post('pos/refresh')
  refreshPosSession(@Body() dto: PosRefreshTokenDto) {
    return this.authService.refreshPosSession({
      refreshToken: dto.refreshToken,
      tenantSlug: dto.tenantSlug,
      deviceCredential: dto.deviceCredential,
    });
  }

  @Get('pos/device-status')
  getPosDeviceStatus(
    @Headers('x-pos-device-credential') deviceCredential?: string,
  ) {
    return this.authService.getPosDeviceStatus(deviceCredential ?? '');
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

