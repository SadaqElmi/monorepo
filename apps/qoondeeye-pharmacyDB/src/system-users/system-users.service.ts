import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SystemUsersService {
  constructor(private readonly prisma: PrismaService) {}

  private isBcryptHash(value: string): boolean {
    return /^\$2[aby]\$\d{2}\$/.test(value);
  }

  private async preparePassword(
    password?: string,
  ): Promise<string | undefined> {
    if (!password) return undefined;
    // Avoid re-hashing when a migration/import already provides a bcrypt hash.
    if (this.isBcryptHash(password)) return password;
    return bcrypt.hash(password, 10);
  }

  async findAll() {
    return this.prisma.systemUser.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.systemUser.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('System user not found');
    return user;
  }

  async create(dto: {
    email: string;
    password: string;
    name?: string;
    role?: string;
  }) {
    const hashedPassword = await this.preparePassword(dto.password);
    return this.prisma.systemUser.create({
      data: {
        email: dto.email,
        password: hashedPassword!,
        name: dto.name,
        ...(dto.role ? { role: dto.role } : {}),
      },
    });
  }

  async update(
    id: string,
    dto: { email?: string; password?: string; name?: string; role?: string },
  ) {
    await this.findOne(id);
    const hashedPassword = await this.preparePassword(dto.password);
    return this.prisma.systemUser.update({
      where: { id },
      data: {
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        role: dto.role,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.systemUser.delete({ where: { id } });
    return { deleted: true };
  }
}
