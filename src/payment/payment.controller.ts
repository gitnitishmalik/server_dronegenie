import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { GetCurrentUserId, Roles } from 'src/common/decorators';
import { VerifyPaymentDto } from './dtos/payment.dto';
import { PaymentService } from './payment.service';

@ApiTags('Payment')
@Controller({ path: 'payment', version: '1' })
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  // Removed: the two @Public() "debug / standalone" endpoints that preceded Payments v2
  // (POST /create-order and POST /verify). These accepted arbitrary amounts with no
  // authentication and created real Razorpay orders on the LIVE merchant account — any
  // external caller could rack up Razorpay order IDs or feed plausible-looking order IDs
  // to customers for phishing. The real flow is the milestone-scoped pair below, which
  // requires customer auth and is gated by PAYMENTS_V2_ENABLED.

  // ---------- Payments v2 — milestone-scoped ----------
  // Both endpoints 404 when PAYMENTS_V2_ENABLED is not 'true'.

  @ApiBearerAuth()
  @Roles(UserRole.CUSTOMER)
  @Post('milestone/:milestoneId/create-order')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a Razorpay order for one milestone (customer-auth, gated)',
  })
  async createMilestoneOrder(
    @Param('milestoneId') milestoneId: string,
    @GetCurrentUserId() userId: string,
  ) {
    return this.paymentService.createMilestoneOrder(milestoneId, userId);
  }

  @ApiBearerAuth()
  @Roles(UserRole.CUSTOMER)
  @Post('milestone/:milestoneId/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify Razorpay payment for one milestone (customer-auth, gated)',
  })
  async verifyMilestonePayment(
    @Param('milestoneId') milestoneId: string,
    @GetCurrentUserId() userId: string,
    @Body() dto: VerifyPaymentDto,
  ) {
    return this.paymentService.verifyMilestonePayment(milestoneId, userId, dto);
  }
}
