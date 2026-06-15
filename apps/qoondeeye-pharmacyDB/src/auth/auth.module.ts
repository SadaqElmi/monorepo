import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppRedisModule } from '../cache/redis.module';
import { AccountingModule } from '../accounting/accounting.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantModule } from '../tenant/tenant.module';
import { AuthService } from '../auth/auth.service';
import { AuthController } from '../auth/auth.controller';
import { JwtStrategy } from '../auth/jwt.strategy';
import { PosAuthRateLimitService } from './pos-auth-rate-limit.service';
import { PosAuditService } from './pos-audit.service';
import { PosRefreshTokenService } from './pos-refresh-token.service';

@Module({
  imports: [
    ConfigModule,
    AppRedisModule,
    AccountingModule,
    PrismaModule,
    TenantModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const expires =
          config.get<string>('JWT_EXPIRES_IN') ?? (60 * 60 * 24).toString(); // default 1 day in seconds

        return {
          secret: config.get<string>('JWT_SECRET') ?? 'changeme',
          signOptions: {
            expiresIn: Number.isNaN(Number(expires))
              ? undefined
              : Number(expires),
          },
        };
      },
    }),
  ],
  providers: [AuthService, JwtStrategy, PosAuthRateLimitService, PosAuditService, PosRefreshTokenService],
  controllers: [AuthController],
  exports: [AuthService, PosAuditService, PosRefreshTokenService],
})
export class AuthModule {}
