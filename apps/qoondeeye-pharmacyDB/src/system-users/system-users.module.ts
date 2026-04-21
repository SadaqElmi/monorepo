import { Module } from '@nestjs/common';
import { SystemUsersController } from './system-users.controller';
import { SystemUsersService } from './system-users.service';

@Module({
  controllers: [SystemUsersController],
  providers: [SystemUsersService],
  exports: [SystemUsersService],
})
export class SystemUsersModule {}
