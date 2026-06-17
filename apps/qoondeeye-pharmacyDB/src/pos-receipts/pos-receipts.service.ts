import { Injectable, NotFoundException } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { SalesService } from '../sales/sales.service';

@Injectable()
export class PosReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly salesService: SalesService,
  ) {}

  async getReceipt(schemaName: string, saleId: string, allowedBranchIds: string[]) {
    const sale = await this.salesService.findOne(schemaName, saleId, allowedBranchIds);
    if (!sale) throw new NotFoundException('Sale not found');
    return this.formatReceipt(sale);
  }

  async getReceiptPdf(
    schemaName: string,
    saleId: string,
    allowedBranchIds: string[],
  ): Promise<Buffer> {
    const receipt = await this.getReceipt(schemaName, saleId, allowedBranchIds);
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.fontSize(16).text('Sales Receipt', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(`Receipt #: ${receipt.receiptNumber ?? saleId}`);
      doc.text(`Date: ${String(receipt.saleDate ?? '')}`);
      doc.text(`Customer: ${receipt.customerName ?? 'Walk-in'}`);
      doc.text(`Payment: ${receipt.paymentMethod ?? '—'}`);
      doc.moveDown();
      const items = Array.isArray(receipt.items) ? receipt.items : [];
      for (const item of items as Array<Record<string, unknown>>) {
        const qty = item.quantity ?? 1;
        const price = item.price ?? item.total ?? 0;
        doc.text(`- ${qty} x ${price}`);
      }
      doc.moveDown();
      doc.text(`Discount: ${receipt.discount ?? 0}`);
      doc.text(`Tax: ${receipt.tax ?? 0}`);
      doc.fontSize(12).text(`Total: ${receipt.totalAmount ?? 0}`, {
        underline: true,
      });
      doc.end();
    });
  }

  async recordReprint(
    schemaName: string,
    saleId: string,
    branchId: string,
    actorUserId: string | null,
  ) {
    await this.prisma.withTenantSchema(schemaName, async (tx) => {
      await tx.$queryRawUnsafe(
        `INSERT INTO pos_receipt_events (sale_id, branch_id, event_type, channel, actor_user_id)
         VALUES ($1::uuid, $2::uuid, 'reprinted', 'print', $3::uuid)`,
        saleId,
        branchId,
        actorUserId,
      );
    });
    return { ok: true };
  }

  async sendEmail(
    schemaName: string,
    saleId: string,
    branchId: string,
    email: string,
    actorUserId: string | null,
  ) {
    await this.prisma.withTenantSchema(schemaName, async (tx) => {
      await tx.$queryRawUnsafe(
        `INSERT INTO pos_receipt_events (sale_id, branch_id, event_type, channel, recipient, actor_user_id)
         VALUES ($1::uuid, $2::uuid, 'resent', 'email', $3, $4::uuid)`,
        saleId,
        branchId,
        email,
        actorUserId,
      );
    });
    return { ok: true, channel: 'email', recipient: email };
  }

  async sendWhatsApp(
    schemaName: string,
    saleId: string,
    branchId: string,
    phone: string,
    actorUserId: string | null,
  ) {
    await this.prisma.withTenantSchema(schemaName, async (tx) => {
      await tx.$queryRawUnsafe(
        `INSERT INTO pos_receipt_events (sale_id, branch_id, event_type, channel, recipient, actor_user_id)
         VALUES ($1::uuid, $2::uuid, 'resent', 'whatsapp', $3, $4::uuid)`,
        saleId,
        branchId,
        phone,
        actorUserId,
      );
    });
    return { ok: true, channel: 'whatsapp', recipient: phone };
  }

  private formatReceipt(sale: Record<string, unknown>) {
    return {
      saleId: sale.id,
      receiptNumber: sale.receipt_number,
      saleDate: sale.sale_date,
      totalAmount: sale.total_amount,
      discount: sale.discount,
      tax: sale.tax,
      paymentMethod: sale.payment_method,
      customerName: sale.customer_name,
      items: sale.items ?? [],
    };
  }
}
