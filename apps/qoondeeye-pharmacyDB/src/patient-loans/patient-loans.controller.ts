import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
  BadRequestException,
  ForbiddenException,
  Req,
} from '@nestjs/common';
import { TenantContextService } from '../tenant/tenant-context.service';
import { PatientLoansService } from './patient-loans.service';
import { CreatePatientLoanDto } from './dto/create-patient-loan.dto';
import { UpdatePatientLoanDto } from './dto/update-patient-loan.dto';
import { CreatePatientLoanPaymentDto } from './dto/create-patient-loan-payment.dto';
import type { Request } from 'express';

@Controller('patient-loans')
export class PatientLoansController {
  constructor(
    private readonly patientLoansService: PatientLoansService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private ensureTenant() {
    if (!this.tenantContext.getTenant()) {
      throw new BadRequestException(
        'Tenant context required. Use X-Tenant header (e.g. X-Tenant: pharmacy1)',
      );
    }
  }

  @Get()
  findAll(@Query('status') status: string | undefined, @Req() req: Request) {
    this.ensureTenant();
    const allowedBranchIds = req.allowedBranchIds ?? [];
    if (!allowedBranchIds.length) {
      throw new ForbiddenException('Access denied to this branch');
    }
    return this.patientLoansService.findAll(
      this.tenantContext.getSchemaName()!,
      status,
      allowedBranchIds,
    );
  }

  @Get('outstanding')
  findOutstanding(@Req() req: Request) {
    this.ensureTenant();
    const allowedBranchIds = req.allowedBranchIds ?? [];
    return this.patientLoansService.findOutstanding(
      this.tenantContext.getSchemaName()!,
      allowedBranchIds,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: Request) {
    this.ensureTenant();
    return this.patientLoansService.findOne(
      this.tenantContext.getSchemaName()!,
      id,
      req.allowedBranchIds ?? [],
    );
  }

  @Get(':id/payments')
  findPayments(@Param('id') id: string, @Req() req: Request) {
    this.ensureTenant();
    return this.patientLoansService.findPayments(
      this.tenantContext.getSchemaName()!,
      id,
      req.allowedBranchIds ?? [],
    );
  }

  @Post()
  create(@Body() dto: CreatePatientLoanDto, @Req() req: Request) {
    this.ensureTenant();
    return this.patientLoansService.create(
      this.tenantContext.getSchemaName()!,
      req.branchId!,
      dto,
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePatientLoanDto,
    @Req() req: Request,
  ) {
    this.ensureTenant();
    return this.patientLoansService.update(
      this.tenantContext.getSchemaName()!,
      id,
      req.branchId!,
      req.allowedBranchIds ?? [],
      dto,
    );
  }

  @Post(':id/payments')
  addPayment(
    @Param('id') id: string,
    @Body() dto: CreatePatientLoanPaymentDto,
    @Req() req: Request,
  ) {
    this.ensureTenant();
    return this.patientLoansService.addPayment(
      this.tenantContext.getSchemaName()!,
      id,
      req.allowedBranchIds ?? [],
      dto,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: Request) {
    this.ensureTenant();
    return this.patientLoansService.remove(
      this.tenantContext.getSchemaName()!,
      id,
      req.allowedBranchIds ?? [],
    );
  }
}
