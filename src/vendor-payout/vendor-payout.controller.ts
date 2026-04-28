import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { UserRole, VendorPayoutStatus } from '@prisma/client';
import { GetCurrentUserId, Roles } from 'src/common/decorators';
import { AdminPayoutListDto, CreateRouteAccountDto } from './dtos/vendor-payout.dto';
import { VendorPayoutService } from './vendor-payout.service';


@ApiTags('VendorPayout')
@ApiBearerAuth()
@Controller({ path: 'vendor-payout', version: '1' })
export class VendorPayoutController {
  constructor(private readonly svc: VendorPayoutService) {}

  @Post('account')
  @Roles(UserRole.VENDOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create Razorpay Route linked account for this vendor (gated)' })
  create(
    @GetCurrentUserId() userId: string,
    @Body() dto: CreateRouteAccountDto,
  ) {
    return this.svc.createRouteAccount(userId, dto);
  }

  @Get('account')
  @Roles(UserRole.VENDOR)
  @ApiOperation({ summary: 'Get the logged-in vendor\'s Route account state (gated)' })
  mine(@GetCurrentUserId() userId: string) {
    return this.svc.getMyAccount(userId);
  }

  @Post('account/sync')
  @Roles(UserRole.VENDOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh Route account status from Razorpay (gated)' })
  sync(@GetCurrentUserId() userId: string) {
    return this.svc.syncAccountStatus(userId);
  }


  @Get('mine')
  @Roles(UserRole.VENDOR)
  @ApiOperation({ summary: 'Vendor: paginated history of own payouts (gated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: VendorPayoutStatus })
  listMine(
    @GetCurrentUserId() userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: VendorPayoutStatus,
  ) {
    const p = Math.max(parseInt(page ?? '1', 10) || 1, 1);
    const l = Math.min(Math.max(parseInt(limit ?? '20', 10) || 20, 1), 100);
    return this.svc.getMyPayouts(userId, p, l, status);
  }


  // ---------- Admin payouts list + retry ----------

  @Get('admin')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: list all vendor payouts with filters (gated)' })
  adminList(@Query() dto: AdminPayoutListDto) {
    return this.svc.adminList(dto);
  }

  @Post('admin/:payoutId/retry')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin: retry a FAILED payout (gated)' })
  adminRetry(@Param('payoutId') payoutId: string) {
    return this.svc.adminRetry(payoutId);
  }


  @Get('admin/export-csv')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: stream CSV export of vendor payouts (gated)' })
  async exportCsv(@Query() dto: AdminPayoutListDto, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="vendor-payouts-${stamp}.csv"`);
    try {
      await this.svc.exportPayoutsCsv(dto, res);
      res.end();
    } catch (err) {
      if (!res.headersSent) res.status(500).send('Export failed');
      else res.end();
    }
  }
}
