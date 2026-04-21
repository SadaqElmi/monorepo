import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(schemaName: string) {
    return this.prisma.withTenantSchema(schemaName, (tx) =>
      tx.$queryRawUnsafe(
        `SELECT id, title, message, type, is_read, created_at FROM notifications ORDER BY created_at DESC`,
      ),
    );
  }

  async findOne(schemaName: string, id: string) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<any[]>(
        `SELECT id, title, message, type, is_read, created_at FROM notifications WHERE id = $1`,
        id,
      );
      return row ?? null;
    });
  }

  async create(
    schemaName: string,
    dto: {
      title?: string;
      message?: string;
      type?: string;
      isRead?: boolean;
    },
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<any[]>(
        `INSERT INTO notifications (title, message, type, is_read) VALUES ($1, $2, $3, COALESCE($4, false)) RETURNING id, title, message, type, is_read, created_at`,
        dto.title ?? null,
        dto.message ?? null,
        dto.type ?? null,
        dto.isRead ?? false,
      );
      return row;
    });
  }

  async update(
    schemaName: string,
    id: string,
    dto: {
      title?: string;
      message?: string;
      type?: string;
      isRead?: boolean;
    },
  ) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      const [row] = await tx.$queryRawUnsafe<any[]>(
        `UPDATE notifications SET title = COALESCE($2, title), message = COALESCE($3, message), type = COALESCE($4, type), is_read = COALESCE($5, is_read) WHERE id = $1 RETURNING id, title, message, type, is_read, created_at`,
        id,
        dto.title ?? null,
        dto.message ?? null,
        dto.type ?? null,
        dto.isRead ?? null,
      );
      return row ?? null;
    });
  }

  async remove(schemaName: string, id: string) {
    return this.prisma.withTenantSchema(schemaName, async (tx) => {
      await tx.$queryRawUnsafe(`DELETE FROM notifications WHERE id = $1`, id);
      return { deleted: true };
    });
  }
}
