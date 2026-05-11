import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Single Nest-provided `PrismaService` (singleton). Do not `new PrismaClient()` elsewhere in `src/`. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
