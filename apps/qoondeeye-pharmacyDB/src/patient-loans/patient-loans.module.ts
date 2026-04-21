import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { PatientLoansController } from './patient-loans.controller';
import { PatientLoansService } from './patient-loans.service';

@Module({
  imports: [TenantModule],
  controllers: [PatientLoansController],
  providers: [PatientLoansService],
  exports: [PatientLoansService],
})
export class PatientLoansModule {}
