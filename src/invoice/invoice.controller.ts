import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InvoiceService } from './invoice.service';
import { GetCurrentUser, Roles } from 'src/common/decorators';
import { UserRole } from '@prisma/client';
import { InvoiceDto } from './dtos/invoice.dto';
import { JwtPayload } from 'src/auth/types/jwtPayload.type';
import { Response } from 'express';

@ApiTags('Invoice')
@ApiBearerAuth()
@Controller({
  path: 'invoice',
  version: '1',
})
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  // Previously @Public() — anyone could download any order's invoice PDF by
  // providing its orderId. Now requires auth and the service enforces
  // "caller must be the customer on the order, or an admin".
  @Post('download/customer')
  @ApiOperation({
    summary: 'Download customer invoice PDF for an order (owner or admin only)',
  })
  @ApiResponse({ status: 200, description: 'Invoice Generated' })
  @ApiResponse({ status: 403, description: 'Not your invoice' })
  @ApiResponse({ status: 404, description: 'Order Not Found' })
  async createCustomer(
    @Body() dto: InvoiceDto,
    @GetCurrentUser() caller: JwtPayload,
    @Res() res: Response,
  ) {
    const generated = await this.invoiceService.generateInvoice(
      dto,
      UserRole.CUSTOMER,
      caller,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${generated.customerInvoiceRecord.fileName || 'customer_invoice.pdf'}"`,
    );

    return res.status(200).send(generated.customerInvoiceRecord.buffer);
  }

  // Previously @Public() — same issue as /download/customer. Now vendor-only
  // (or admin) via the ownership check in the service.
  @Post('download/vendor')
  @ApiOperation({
    summary: 'Download vendor invoice PDF for an order (owner or admin only)',
  })
  @ApiResponse({ status: 200, description: 'Invoice Generated' })
  @ApiResponse({ status: 403, description: 'Not your invoice' })
  @ApiResponse({ status: 404, description: 'Order Not Found' })
  async createVendor(
    @Body() dto: InvoiceDto,
    @GetCurrentUser() caller: JwtPayload,
    @Res() res: Response,
  ) {
    const generated = await this.invoiceService.generateInvoice(
      dto,
      UserRole.VENDOR,
      caller,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${generated.vendorInvoiceRecord.fileName || 'vendor_invoice.pdf'}"`,
    );

    return res.status(200).send(generated.vendorInvoiceRecord.buffer);
  }

  // Previously @Public() — same issue: invoice records (numbers, amounts,
  // party refs) were readable to any caller. Now requires the caller to be
  // the customer, the vendor, or an admin on the order.
  @Get(':orderId')
  @ApiOperation({
    summary: 'Get Invoice Records For An Order (customer, vendor, or admin)',
  })
  @ApiResponse({ status: 200, description: 'Invoices Retrived Successfully' })
  @ApiResponse({ status: 403, description: 'Not your order' })
  @ApiResponse({ status: 404, description: 'Invoices Not Found' })
  get(@Param('orderId') orderId: string, @GetCurrentUser() caller: JwtPayload) {
    return this.invoiceService.getInvoicesByOrderId(orderId, caller);
  }

  @Roles(UserRole.ADMIN)
  @Post('admin/resend/:orderId/:role')
  @ApiOperation({
    summary:
      'Admin: regenerate PDF from existing invoice row and re-send email',
  })
  @ApiResponse({ status: 200, description: 'Invoice email resent' })
  @ApiResponse({ status: 404, description: 'Order or invoice not found' })
  adminResend(@Param('orderId') orderId: string, @Param('role') role: string) {
    const upper = (role || '').toUpperCase();
    const mapped =
      upper === 'VENDOR'
        ? UserRole.VENDOR
        : upper === 'CUSTOMER'
          ? UserRole.CUSTOMER
          : null;
    if (!mapped) {
      throw new BadRequestException('role must be vendor or customer');
    }
    return this.invoiceService.resendInvoiceEmail(orderId, mapped);
  }
}
