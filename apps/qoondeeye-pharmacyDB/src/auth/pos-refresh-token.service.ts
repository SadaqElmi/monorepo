import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export type PosRefreshIssueContext = {
  schemaName: string;
  userId: string;
  deviceId?: string | null;
  role: string;
  tenantId: string;
  branchId: string;
  staffId: string;
  permissionCodes: string[];
};

@Injectable()
export class PosRefreshTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private refreshTtlMs(): number {
    const days = Number(this.config.get<string>('JWT_REFRESH_EXPIRES_DAYS') ?? '7');
    return (Number.isFinite(days) && days > 0 ? days : 7) * 24 * 60 * 60 * 1000;
  }

  accessTokenExpiresIn(): number {
    const raw =
      this.config.get<string>('JWT_ACCESS_EXPIRES_IN')?.trim() ??
      this.config.get<string>('JWT_CASHIER_EXPIRES_IN')?.trim() ??
      '900';
    const n = Number(raw);
    return !Number.isNaN(n) && n > 0 ? n : 900;
  }

  async issuePair(ctx: PosRefreshIssueContext) {
    const rawRefresh = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawRefresh);
    const expiresAt = new Date(Date.now() + this.refreshTtlMs());

    await this.prisma.withTenantSchema(ctx.schemaName, async (tx) => {
      await tx.$queryRawUnsafe(
        `INSERT INTO pos_refresh_tokens (user_id, device_id, token_hash, expires_at)
         VALUES ($1::uuid, $2::uuid, $3, $4)`,
        ctx.userId,
        ctx.deviceId ?? null,
        tokenHash,
        expiresAt,
      );
    });

    const accessToken = await this.jwtService.signAsync(
      {
        sub: ctx.userId,
        role: ctx.role,
        type: 'tenant_user',
        tenantSchema: ctx.schemaName,
        tenantId: ctx.tenantId,
        authMode: 'device_pin',
        posDeviceId: ctx.deviceId ?? null,
        terminalId: ctx.deviceId ?? null,
        branchId: ctx.branchId,
        staffId: ctx.staffId,
        canViewAllBranches: false,
        permissions: ctx.permissionCodes,
      },
      { expiresIn: this.accessTokenExpiresIn() },
    );

    return {
      accessToken,
      refreshToken: rawRefresh,
      expiresIn: this.accessTokenExpiresIn(),
    };
  }

  async rotateRefreshToken(input: {
    schemaName: string;
    refreshToken: string;
    deviceId?: string | null;
  }) {
    const tokenHash = this.hashToken(input.refreshToken.trim());

    return this.prisma.withTenantSchema(input.schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<
        {
          id: string;
          user_id: string;
          device_id: string | null;
          expires_at: Date;
          revoked_at: Date | null;
        }[]
      >(
        `SELECT id, user_id, device_id, expires_at, revoked_at
         FROM pos_refresh_tokens
         WHERE token_hash = $1
         FOR UPDATE`,
        tokenHash,
      );

      if (!row || row.revoked_at) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      if (row.expires_at.getTime() < Date.now()) {
        throw new UnauthorizedException('Refresh token expired');
      }
      if (input.deviceId && row.device_id && row.device_id !== input.deviceId) {
        throw new ForbiddenException('Refresh token device mismatch');
      }

      const [user] = await tx.$queryRawUnsafe<
        {
          id: string;
          staff_id: string | null;
          branch_id: string | null;
          role_name: string;
        }[]
      >(
        `SELECT u.id, u.staff_id, u.branch_id, lower(r.name) AS role_name
         FROM users u
         INNER JOIN roles r ON u.role_id = r.id
         WHERE u.id = $1::uuid`,
        row.user_id,
      );
      if (!user?.branch_id) {
        throw new UnauthorizedException('User no longer valid for POS');
      }

      const permissionRows = await tx.$queryRawUnsafe<{ name: string }[]>(
        `SELECT DISTINCT p.name AS name
         FROM permissions p
         INNER JOIN role_permissions rp ON rp.permission_id = p.id
         INNER JOIN users u ON u.role_id = rp.role_id
         WHERE u.id = $1::uuid`,
        row.user_id,
      );
      const permissionCodes = (permissionRows ?? [])
        .map((r) => r.name)
        .filter(Boolean);

      const rawRefresh = randomBytes(32).toString('hex');
      const newHash = this.hashToken(rawRefresh);
      const expiresAt = new Date(Date.now() + this.refreshTtlMs());

      const [inserted] = await tx.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO pos_refresh_tokens (user_id, device_id, token_hash, expires_at)
         VALUES ($1::uuid, $2::uuid, $3, $4)
         RETURNING id`,
        row.user_id,
        row.device_id,
        newHash,
        expiresAt,
      );

      await tx.$queryRawUnsafe(
        `UPDATE pos_refresh_tokens
         SET revoked_at = NOW(), replaced_by = $2::uuid
         WHERE id = $1::uuid`,
        row.id,
        inserted.id,
      );

      const accessToken = await this.jwtService.signAsync(
        {
          sub: user.id,
          role: user.role_name,
          type: 'tenant_user',
          tenantSchema: input.schemaName,
          authMode: 'device_pin',
          posDeviceId: row.device_id,
          terminalId: row.device_id,
          branchId: user.branch_id,
          staffId: user.staff_id?.trim() || user.id,
          canViewAllBranches: false,
          permissions: permissionCodes,
        },
        { expiresIn: this.accessTokenExpiresIn() },
      );

      return {
        accessToken,
        refreshToken: rawRefresh,
        expiresIn: this.accessTokenExpiresIn(),
      };
    });
  }

  async revokeRefreshToken(schemaName: string, refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken.trim());
    await this.prisma.withTenantSchema(schemaName, async (tx) => {
      await tx.$queryRawUnsafe(
        `UPDATE pos_refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`,
        tokenHash,
      );
    });
    return { ok: true };
  }
}
