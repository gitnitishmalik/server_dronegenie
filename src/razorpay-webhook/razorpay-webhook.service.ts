import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { MilestoneStatus, RouteAccountStatus, VendorPayoutStatus } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';


// Razorpay event type → normalised RouteAccountStatus. Account events carry
// Razorpay's own status string on `payload.account.entity.status` (the exact
// key varies by event; we fall back across plausible paths in the handler).
function mapAccountStatus(rzpStatus: string | undefined): RouteAccountStatus | null {
  switch ((rzpStatus || '').toLowerCase()) {
    case 'activated':
    case 'active':
      return RouteAccountStatus.ACTIVATED;
    case 'under_review':
      return RouteAccountStatus.UNDER_REVIEW;
    case 'needs_clarification':
      return RouteAccountStatus.NEEDS_CLARIFICATION;
    case 'suspended':
      return RouteAccountStatus.SUSPENDED;
    case 'rejected':
      return RouteAccountStatus.REJECTED;
    case 'created':
      return RouteAccountStatus.CREATED;
    default:
      return null;
  }
}


@Injectable()
export class RazorpayWebhookService {
  private readonly logger = new Logger(RazorpayWebhookService.name);

  constructor(private readonly prisma: PrismaService) {}


  // Verify the webhook is really from Razorpay. Compare HMAC-SHA256(secret, body)
  // with the x-razorpay-signature header using a constant-time compare.
  verify(rawBody: Buffer | string | undefined, signatureHeader: string | undefined): boolean {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
    if (!secret) {
      // Explicit misconfiguration — return false so the endpoint 401s rather
      // than silently accepting unauthenticated webhooks.
      this.logger.warn('RAZORPAY_WEBHOOK_SECRET is empty — rejecting webhook');
      return false;
    }
    if (!rawBody || !signatureHeader) return false;

    const bodyBuf = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
    const expected = createHmac('sha256', secret).update(bodyBuf).digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signatureHeader, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }


  // Persist + dispatch. Idempotency lives on the razorpay_event_id unique
  // index — a replay of the same event short-circuits at the upsert.
  async process(event: any): Promise<{ processed: boolean; reason?: string; event_id?: string }> {
    const eventId: string | undefined = event?.id || event?.event_id;
    const eventName: string | undefined = event?.event;
    const signature = event?.__signature || '';

    if (!eventId || !eventName) {
      throw new InternalServerErrorException('Razorpay event missing id or event');
    }

    // If we've processed this event_id before, bail early.
    const existing = await this.prisma.razorpayWebhookEvent.findUnique({
      where: { razorpay_event_id: eventId },
    });
    if (existing?.processed) {
      return { processed: true, reason: 'already processed', event_id: eventId };
    }

    // Record receipt before dispatching — if the handler crashes, the row
    // still exists with processed=false and an error for admin inspection.
    const stored = existing
      ? existing
      : await this.prisma.razorpayWebhookEvent.create({
          data: {
            razorpay_event_id: eventId,
            event: eventName,
            payload: event,
            signature,
            processed: false,
          },
        });

    try {
      await this.dispatch(eventName, event);
      await this.prisma.razorpayWebhookEvent.update({
        where: { id: stored.id },
        data: { processed: true, processed_at: new Date(), error: null },
      });
      return { processed: true, event_id: eventId };
    } catch (err: any) {
      const msg = err?.message || String(err);
      this.logger.error(`Handler for ${eventName} failed: ${msg}`);
      await this.prisma.razorpayWebhookEvent.update({
        where: { id: stored.id },
        data: { error: msg.slice(0, 500) },
      });
      // Return 200 anyway so Razorpay doesn't retry. Admin can reprocess via
      // the stored row. (Razorpay retries 5xx; we swallow to DB and ack 200.)
      return { processed: false, reason: msg, event_id: eventId };
    }
  }


  private async dispatch(eventName: string, event: any) {
    const p = event?.payload ?? {};

    switch (eventName) {
      case 'payment.captured':
      case 'payment.authorized':
      case 'payment.failed': {
        const payment = p?.payment?.entity;
        if (!payment?.order_id) return;
        const status = eventName === 'payment.captured' ? 'paid' : eventName === 'payment.failed' ? 'failed' : 'attempted';
        await this.prisma.razorpayOrder.updateMany({
          where: { razorpay_order_id: payment.order_id },
          data: {
            status,
            razorpay_payment_id: payment.id ?? undefined,
            captured_at: eventName === 'payment.captured' ? new Date((payment.created_at ?? 0) * 1000 || Date.now()) : undefined,
          },
        });
        return;
      }

      case 'refund.processed':
      case 'refund.created': {
        const refund = p?.refund?.entity;
        if (!refund?.payment_id) return;
        // We only log in the webhook event row — refund bookkeeping already
        // happened when admin clicked Resolve → Refund (VendorPayout REVERSED).
        this.logger.log(`Refund ${refund.id} (${refund.status}) for payment ${refund.payment_id} — event recorded.`);
        return;
      }

      case 'transfer.processed': {
        // Razorpay fully settled the release. Upgrade any FAILED/PROCESSED
        // audit row to PROCESSED + stamp provider_reference_id with the
        // transfer's settlement id.
        const transfer = p?.transfer?.entity;
        if (!transfer?.id) return;
        await this.prisma.vendorPayout.updateMany({
          where: { provider_payout_id: transfer.id },
          data: {
            status: VendorPayoutStatus.PROCESSED,
            failure_reason: null,
            provider_reference_id: transfer.settlement_id ?? undefined,
          },
        });
        return;
      }

      case 'transfer.reversed': {
        const transfer = p?.transfer?.entity;
        if (!transfer?.id) return;
        await this.prisma.vendorPayout.updateMany({
          where: { provider_payout_id: transfer.id },
          data: { status: VendorPayoutStatus.REVERSED },
        });
        return;
      }

      case 'account.updated':
      case 'account.under_review':
      case 'account.activated':
      case 'account.needs_clarification':
      case 'account.suspended':
      case 'account.rejected': {
        const acc = p?.account?.entity;
        if (!acc?.id) return;
        const newStatus = mapAccountStatus(acc.status);
        if (!newStatus) return;
        const existing = await this.prisma.vendorPayoutAccount.findUnique({
          where: { razorpay_account_id: acc.id },
        });
        if (!existing) return;
        await this.prisma.vendorPayoutAccount.update({
          where: { id: existing.id },
          data: {
            status: newStatus,
            activated_at: newStatus === RouteAccountStatus.ACTIVATED && !existing.activated_at
              ? new Date()
              : existing.activated_at,
            last_synced_at: new Date(),
            last_sync_error: null,
          },
        });
        return;
      }

      default:
        // Unhandled but accepted — the row is kept for audit.
        this.logger.debug(`Unhandled Razorpay event: ${eventName}`);
        return;
    }
  }
}
