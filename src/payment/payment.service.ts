import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import Razorpay = require('razorpay');
import { PrismaService } from 'src/prisma/prisma.service';
import { sendSMS } from 'src/common/utils/send-sms.util';
import { MilestoneStatus, RouteAccountStatus, VendorPayoutStatus } from '@prisma/client';
import { CreateOrderDto, VerifyPaymentDto } from './dtos/payment.dto';

@Injectable()
export class PaymentService implements OnModuleInit {
  private readonly logger = new Logger(PaymentService.name);
  private client: Razorpay;
  private keyId: string;
  private keySecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.keyId = process.env.RAZORPAY_KEY_ID || '';
    this.keySecret = process.env.RAZORPAY_KEY_SECRET || '';
    if (!this.keyId || !this.keySecret) {
      this.logger.warn(
        'RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not configured — payment endpoints will fail.',
      );
      return;
    }
    this.client = new Razorpay({
      key_id: this.keyId,
      key_secret: this.keySecret,
    });
  }

  private ensureClient() {
    if (!this.client) {
      throw new InternalServerErrorException('Razorpay is not configured');
    }
  }

  // Endpoints gated by PAYMENTS_V2_ENABLED behave as if they don't exist
  // when the flag is off, so the FE can probe without leaking that the
  // feature is coming. Flipping the flag is a single-file change + restart.
  private ensureV2Enabled() {
    const on = this.config.get<string>('PAYMENTS_V2_ENABLED') === 'true';
    if (!on) {
      throw new NotFoundException('Cannot find this route');
    }
  }

  async createOrder(dto: CreateOrderDto) {
    this.ensureClient();
    const currency = dto.currency || 'INR';
    const receipt = dto.receipt || `rcpt_${Date.now()}`;

    try {
      const order = await this.client.orders.create({
        amount: dto.amount,
        currency,
        receipt,
      });
      return {
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
      };
    } catch (err: any) {
      const status = err?.statusCode;
      if (status === 401) {
        throw new UnauthorizedException('Razorpay authentication failed');
      }
      this.logger.error(
        `Razorpay order.create failed: ${err?.error?.description || err?.message}`,
      );
      throw new InternalServerErrorException(
        'Failed to create Razorpay order',
      );
    }
  }

  verifySignature(dto: VerifyPaymentDto): boolean {
    if (!this.keySecret) {
      throw new InternalServerErrorException('Razorpay is not configured');
    }
    const payload = `${dto.razorpay_order_id}|${dto.razorpay_payment_id}`;
    const expected = createHmac('sha256', this.keySecret)
      .update(payload)
      .digest('hex');

    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(dto.razorpay_signature, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }


  // Fetch a milestone + its order + the customer's userId in one hop so we
  // can authorize ownership without an extra round-trip in each endpoint.
  private async loadMilestoneForCustomer(milestoneId: string, userId: string) {
    const milestone = await this.prisma.orderMilestone.findUnique({
      where: { id: milestoneId },
      include: {
        order: {
          select: {
            id: true,
            customerId: true,
            customer: { select: { userId: true, user: { select: { phone: true } } } },
          },
        },
      },
    });
    if (!milestone) throw new NotFoundException('Milestone not found');
    if (milestone.order.customer?.userId !== userId) {
      throw new ForbiddenException('This milestone does not belong to you');
    }
    return milestone;
  }


  // Customer pays for ONE milestone. Strict sequence: every milestone
  // before this one must already be COMPLETED (redeemed OTP — which ships
  // in PR #4). Gated behind PAYMENTS_V2_ENABLED.
  async createMilestoneOrder(milestoneId: string, userId: string) {
    this.ensureV2Enabled();
    this.ensureClient();

    const milestone = await this.loadMilestoneForCustomer(milestoneId, userId);

    if (milestone.status !== MilestoneStatus.PENDING) {
      throw new ConflictException(
        `Milestone is ${milestone.status} — only PENDING milestones can be paid`,
      );
    }

    // Strict sequence gate
    const earlier = await this.prisma.orderMilestone.findMany({
      where: { orderId: milestone.orderId, seq: { lt: milestone.seq } },
      select: { status: true, seq: true },
      orderBy: { seq: 'asc' },
    });
    const blocker = earlier.find((m) => m.status !== MilestoneStatus.COMPLETED);
    if (blocker) {
      throw new ConflictException(
        `Milestone ${blocker.seq} must be COMPLETED before this one can be paid (currently ${blocker.status})`,
      );
    }

    // Load the vendor's Route account. Route requires a linked account to
    // exist and be ACTIVATED before we can route funds to it at payment time.
    // Block checkout until the vendor finishes Route onboarding — otherwise
    // money would land in DG's balance with nowhere to auto-settle.
    const orderRow = await this.prisma.order.findUnique({
      where: { id: milestone.orderId },
      select: { vendorId: true },
    });
    const payoutAccount = orderRow
      ? await this.prisma.vendorPayoutAccount.findUnique({
          where: { vendorId: orderRow.vendorId },
        })
      : null;
    if (!payoutAccount || payoutAccount.status !== RouteAccountStatus.ACTIVATED || !payoutAccount.razorpay_account_id) {
      throw new ConflictException(
        'Vendor has not completed payout setup yet. Payment cannot proceed until the vendor activates their Razorpay Route account.',
      );
    }

    const amountPaise = Math.round(milestone.customer_amount * 100);
    const vendorAmountPaise = Math.round(milestone.vendor_amount * 100);
    if (amountPaise < 100) {
      throw new BadRequestException(
        `Milestone amount (₹${milestone.customer_amount}) is below Razorpay's ₹1 minimum`,
      );
    }

    const receipt = `m_${milestone.id.slice(-12)}_${Date.now().toString(36)}`;

    let rzpOrder: any;
    try {
      rzpOrder = await this.client.orders.create({
        amount: amountPaise,
        currency: 'INR',
        receipt,
        // Route: auto-create an on_hold transfer for the vendor's share when
        // payment captures. DG keeps commission + GST in the main balance.
        // We release the hold in redeemMilestoneOtp after OTP redemption.
        transfers: [
          {
            account: payoutAccount.razorpay_account_id,
            amount: vendorAmountPaise,
            currency: 'INR',
            on_hold: true,
            notes: {
              milestoneId: milestone.id,
              orderId: milestone.orderId,
              seq: String(milestone.seq),
            },
          },
        ],
        notes: {
          milestoneId: milestone.id,
          orderId: milestone.orderId,
          seq: String(milestone.seq),
        },
      } as any);
    } catch (err: any) {
      if (err?.statusCode === 401) {
        throw new UnauthorizedException('Razorpay authentication failed');
      }
      this.logger.error(
        `Razorpay milestone order.create failed: ${err?.error?.description || err?.message}`,
      );
      throw new InternalServerErrorException('Failed to create Razorpay order');
    }

    // Write audit row + stamp milestone with the razorpay_order_id so a later
    // webhook or re-check can correlate the payment.
    await this.prisma.$transaction([
      this.prisma.razorpayOrder.create({
        data: {
          razorpay_order_id: rzpOrder.id,
          orderId: milestone.orderId,
          milestoneId: milestone.id,
          amount: amountPaise,
          currency: 'INR',
          receipt,
          status: rzpOrder.status ?? 'created',
          raw: rzpOrder,
        },
      }),
      this.prisma.orderMilestone.update({
        where: { id: milestone.id },
        data: { razorpay_order_id: rzpOrder.id },
      }),
    ]);

    return {
      order_id: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      key_id: this.keyId,
      milestoneId: milestone.id,
    };
  }


  // Customer finishes Razorpay Checkout and POSTs the resulting
  // (order_id, payment_id, signature). We HMAC-verify, mark the milestone
  // OTP_ISSUED, generate a 6-digit OTP, and SMS it to the customer.
  async verifyMilestonePayment(
    milestoneId: string,
    userId: string,
    dto: VerifyPaymentDto,
  ) {
    this.ensureV2Enabled();

    const milestone = await this.loadMilestoneForCustomer(milestoneId, userId);

    if (milestone.status !== MilestoneStatus.PENDING) {
      throw new ConflictException(
        `Milestone is ${milestone.status} — already processed`,
      );
    }
    if (!milestone.razorpay_order_id) {
      throw new BadRequestException(
        'No Razorpay order on this milestone — call create-order first',
      );
    }
    if (milestone.razorpay_order_id !== dto.razorpay_order_id) {
      throw new BadRequestException(
        'razorpay_order_id does not match this milestone',
      );
    }

    const ok = this.verifySignature(dto);
    if (!ok) {
      throw new BadRequestException('Invalid payment signature');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const now = new Date();

    // Best-effort fetch of the auto-created on_hold transfer ID. Razorpay
    // creates it automatically when the order captures because we passed
    // transfers[] at create time. If this lookup fails, the payment still
    // succeeds — admin can backfill the transfer_id later.
    let transferId: string | null = null;
    try {
      const transfers = await (this.client as any).orders.fetchTransferOrder(dto.razorpay_order_id);
      const t = Array.isArray(transfers?.items) ? transfers.items[0] : transfers?.[0];
      if (t?.id) transferId = t.id;
    } catch {
      try {
        const order: any = await this.client.orders.fetch(dto.razorpay_order_id);
        const t = Array.isArray(order?.transfers) ? order.transfers[0] : null;
        if (t?.id) transferId = t.id;
      } catch (err: any) {
        this.logger.warn(
          `Could not fetch transfer id for order ${dto.razorpay_order_id}: ${err?.message}`,
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.orderMilestone.update({
        where: { id: milestone.id },
        data: {
          status: MilestoneStatus.OTP_ISSUED,
          otp,
          otp_issued_at: now,
          ...(transferId ? { razorpay_transfer_id: transferId } : {}),
        },
      }),
      this.prisma.razorpayOrder.update({
        where: { razorpay_order_id: dto.razorpay_order_id },
        data: {
          status: 'paid',
          razorpay_payment_id: dto.razorpay_payment_id,
          razorpay_signature: dto.razorpay_signature,
          captured_at: now,
        },
      }),
    ]);

    // Best-effort SMS — don't fail the payment if the SMS API blips.
    const phone = milestone.order.customer?.user?.phone?.trim();
    if (phone) {
      try {
        await sendSMS(phone, otp);
      } catch (err: any) {
        this.logger.error(
          `Milestone OTP SMS failed for milestone=${milestone.id}: ${err?.message}`,
        );
      }
    } else {
      this.logger.warn(
        `No phone on file for milestone=${milestone.id} customer — OTP was generated but not sent`,
      );
    }

    return {
      success: true,
      milestoneId: milestone.id,
      status: MilestoneStatus.OTP_ISSUED,
    };
  }


  // Called from OrderService.redeemMilestoneOtp once the milestone transitions
  // to COMPLETED. Releases the on_hold Route transfer so Razorpay settles funds
  // to the vendor's linked account in their next settlement cycle, and writes
  // a VendorPayout audit row.
  //
  // Deliberately tolerant: a release failure does NOT block the completion —
  // admin can retry from the payout list once PR #5+ ships that UI. We still
  // persist a FAILED VendorPayout row so the situation is visible.
  async releaseMilestoneTransfer(milestoneId: string): Promise<{ released: boolean; payoutId: string | null; reason?: string }> {
    const milestone = await this.prisma.orderMilestone.findUnique({
      where: { id: milestoneId },
      include: { order: { select: { vendorId: true } } },
    });
    if (!milestone) return { released: false, payoutId: null, reason: 'milestone not found' };

    if (!milestone.razorpay_transfer_id) {
      // No transfer was recorded at payment time (either V1 flow or fetch-transfer lookup failed).
      // Nothing to release; leave for admin reconciliation.
      return { released: false, payoutId: null, reason: 'no razorpay_transfer_id on milestone' };
    }

    const amountPaise = Math.round(milestone.vendor_amount * 100);

    try {
      await (this.client as any).transfers.edit(milestone.razorpay_transfer_id, { on_hold: false });
    } catch (err: any) {
      const desc = err?.error?.description || err?.message;
      this.logger.error(
        `transfers.edit on_hold=false failed for milestone=${milestone.id} transfer=${milestone.razorpay_transfer_id}: ${desc}`,
      );
      const failedPayout = await this.prisma.vendorPayout.create({
        data: {
          vendorId: milestone.order.vendorId,
          amount: amountPaise,
          currency: 'INR',
          status: VendorPayoutStatus.FAILED,
          provider_payout_id: milestone.razorpay_transfer_id,
          failure_reason: String(desc).slice(0, 500),
          milestones: { connect: [{ id: milestone.id }] },
        },
      });
      await this.prisma.orderMilestone.update({
        where: { id: milestone.id },
        data: { payout_id: failedPayout.id },
      });
      return { released: false, payoutId: failedPayout.id, reason: String(desc) };
    }

    const payout = await this.prisma.vendorPayout.create({
      data: {
        vendorId: milestone.order.vendorId,
        amount: amountPaise,
        currency: 'INR',
        status: VendorPayoutStatus.PROCESSED,
        provider_payout_id: milestone.razorpay_transfer_id,
        milestones: { connect: [{ id: milestone.id }] },
      },
    });
    await this.prisma.orderMilestone.update({
      where: { id: milestone.id },
      data: { payout_id: payout.id },
    });

    return { released: true, payoutId: payout.id };
  }


  // Called from OrderService.resolveDispute when admin rules in favour of the
  // customer. Best-effort: (1) reverse the Route on_hold transfer so the
  // vendor's share returns to DG's main balance; (2) refund the customer's
  // payment from that balance. Each step is wrapped independently — a failure
  // of one doesn't stop the other, and the milestone stays REFUNDED. A
  // VendorPayout REVERSED row is written for audit.
  async reverseMilestoneTransferAndRefund(milestoneId: string): Promise<{
    transferReversed: boolean;
    paymentRefunded: boolean;
    refundId: string | null;
    warnings: string[];
  }> {
    const warnings: string[] = [];

    const milestone = await this.prisma.orderMilestone.findUnique({
      where: { id: milestoneId },
      include: { order: { select: { vendorId: true } } },
    });
    if (!milestone) {
      return { transferReversed: false, paymentRefunded: false, refundId: null, warnings: ['milestone not found'] };
    }

    let transferReversed = false;
    if (milestone.razorpay_transfer_id) {
      try {
        await (this.client as any).transfers.reverse(milestone.razorpay_transfer_id);
        transferReversed = true;
      } catch (err: any) {
        const desc = err?.error?.description || err?.message;
        warnings.push(`transfer reverse failed: ${desc}`);
        this.logger.error(`transfers.reverse failed for milestone=${milestone.id}: ${desc}`);
      }
    } else {
      warnings.push('no razorpay_transfer_id on milestone — transfer reverse skipped');
    }

    // Refund the customer. We look up the Razorpay payment ID via the
    // RazorpayOrder audit row (stamped on signature verify).
    let paymentRefunded = false;
    let refundId: string | null = null;

    const rzpOrder = milestone.razorpay_order_id
      ? await this.prisma.razorpayOrder.findUnique({
          where: { razorpay_order_id: milestone.razorpay_order_id },
        })
      : null;

    if (rzpOrder?.razorpay_payment_id) {
      try {
        const amountPaise = Math.round(milestone.customer_amount * 100);
        const refund: any = await (this.client as any).payments.refund(rzpOrder.razorpay_payment_id, {
          amount: amountPaise,
          speed: 'normal',
          notes: { milestoneId: milestone.id, reason: 'dispute_refund' },
        });
        refundId = refund?.id || null;
        paymentRefunded = true;
      } catch (err: any) {
        const desc = err?.error?.description || err?.message;
        warnings.push(`payment refund failed: ${desc}`);
        this.logger.error(`payments.refund failed for milestone=${milestone.id}: ${desc}`);
      }
    } else {
      warnings.push('no razorpay_payment_id on the audit row — refund skipped');
    }

    // Audit row: REVERSED means "we intended to return this money". Even if
    // one of the two API calls above failed, the row makes the intent visible
    // to admin for manual reconciliation.
    const payout = await this.prisma.vendorPayout.create({
      data: {
        vendorId: milestone.order.vendorId,
        amount: Math.round(milestone.vendor_amount * 100),
        currency: 'INR',
        status: VendorPayoutStatus.REVERSED,
        provider_payout_id: milestone.razorpay_transfer_id ?? null,
        provider_reference_id: refundId,
        failure_reason: warnings.length ? warnings.join(' | ').slice(0, 500) : null,
        milestones: { connect: [{ id: milestone.id }] },
      },
    });
    await this.prisma.orderMilestone.update({
      where: { id: milestone.id },
      data: { payout_id: payout.id },
    });

    return { transferReversed, paymentRefunded, refundId, warnings };
  }
}
