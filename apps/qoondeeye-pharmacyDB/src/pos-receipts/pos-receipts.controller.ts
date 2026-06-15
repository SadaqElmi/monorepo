import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { TenantContextService } from '../tenant/tenant-context.service';
import { PosReceiptsService } from './pos-receipts.service';

class SendReceiptEmailDto {
  @IsEmail()
  email!: string;
}

class SendReceiptWhatsAppDto {
  @IsString()
  phone!: string;
}

@Controller('pos/receipts')
export class PosReceiptsController {
  constructor(
    private readonly receiptsService: PosReceiptsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private schema() {
    const tenant = this.tenantContext.getTenant();
    if (!tenant) throw new BadRequestException('Tenant context required');
    return tenant.schemaName;
  }

  @Get(':saleId')
  getReceipt(@Param('saleId') saleId: string, @Req() req: FastifyRequest) {
    return this.receiptsService.getReceipt(
      this.schema(),
      saleId,
      req.allowedBranchIds ?? [],
    );
  }

  @Get(':saleId/pdf')
  async getReceiptPdf(
    @Param('saleId') saleId: string,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const pdf = await this.receiptsService.getReceiptPdf(
      this.schema(),
      saleId,
      req.allowedBranchIds ?? [],
    );
    reply
      .header('Content-Type', 'application/pdf')
      .header(
        'Content-Disposition',
        `inline; filename="receipt-${saleId.slice(0, 8)}.pdf"`,
      )
      .send(pdf);
  }

  @Post(':saleId/reprint')
  reprint(@Param('saleId') saleId: string, @Req() req: FastifyRequest) {
    if (!req.branchId) throw new BadRequestException('Branch required');
    return this.receiptsService.recordReprint(
      this.schema(),
      saleId,
      req.branchId,
      req.userId ?? null,
    );
  }

  @Post(':saleId/email')
  email(
    @Param('saleId') saleId: string,
    @Body() dto: SendReceiptEmailDto,
    @Req() req: FastifyRequest,
  ) {
    if (!req.branchId) throw new BadRequestException('Branch required');
    return this.receiptsService.sendEmail(
      this.schema(),
      saleId,
      req.branchId,
      dto.email,
      req.userId ?? null,
    );
  }

  @Post(':saleId/whatsapp')
  whatsapp(
    @Param('saleId') saleId: string,
    @Body() dto: SendReceiptWhatsAppDto,
    @Req() req: FastifyRequest,
  ) {
    if (!req.branchId) throw new BadRequestException('Branch required');
    return this.receiptsService.sendWhatsApp(
      this.schema(),
      saleId,
      req.branchId,
      dto.phone,
      req.userId ?? null,
    );
  }
}
