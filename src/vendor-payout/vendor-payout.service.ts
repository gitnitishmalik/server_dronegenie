import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CompanyType,
  MilestoneStatus,
  Prisma,
  RouteAccountStatus,
  VendorPayoutStatus,
} from '@prisma/client';
import Razorpay from 'razorpay';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaymentService } from 'src/payment/payment.service';
import {
  AdminPayoutListDto,
  CreateRouteAccountDto,
} from './dtos/vendor-payout.dto';

// Map DroneGenie's CompanyType enum onto Razorpay Route's business_type field.
// Values accepted by Razorpay: proprietorship | partnership | private_limited |
//   public_limited | llp | trust | society | ngo | individual |
//   not_yet_registered | educational_institutes | public_sector_undertaking
function mapBusinessType(t: CompanyType): string {
  switch (t) {
    case CompanyType.PROPRIETORSHIP:
      return 'proprietorship';
    case CompanyType.PARTNERSHIP:
      return 'partnership';
    case CompanyType.PRIVATE_LIMITED_COMPANY:
      return 'private_limited';
    case CompanyType.PUBLIC_LIMITED_COMPANY:
      return 'public_limited';
    case CompanyType.PUBLIC_SECTOR_UNDERTAKING:
      return 'public_sector_undertaking';
    case CompanyType.PRIVATE_SECTOR_UNDERTAKING:
      return 'proprietorship';
    case CompanyType.CO_OPERATIVE_SOCIETIES:
      return 'society';
    case CompanyType.TRUST_SOCIETY_ASSOCIATION_OF_PERSONS:
      return 'trust';
    case CompanyType.GOVERNMENT_ORGANIZATIONS:
      return 'public_sector_undertaking';
    default:
      return 'proprietorship';
  }
}

// Razorpay's activation status lives on the linked account. Normalise onto our
// enum so the rest of the app doesn't have to know Razorpay's exact wording.
function mapRazorpayStatus(rzpStatus: string | undefined): RouteAccountStatus {
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
    default:
      return RouteAccountStatus.CREATED;
  }
}

@Injectable()
export class VendorPayoutService implements OnModuleInit {
  private readonly logger = new Logger(VendorPayoutService.name);
  private client: Razorpay;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly paymentService: PaymentService,
  ) {}

  onModuleInit() {
    const keyId = process.env.RAZORPAY_KEY_ID || '';
    const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
    if (keyId && keySecret) {
      this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
    }
  }

  private ensureV2Enabled() {
    const on = this.config.get<string>('PAYMENTS_V2_ENABLED') === 'true';
    if (!on) throw new NotFoundException('Cannot find this route');
  }

  private ensureClient() {
    if (!this.client) {
      throw new InternalServerErrorException('Razorpay is not configured');
    }
  }

  private async getVendorByUserId(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
      include: { user: { select: { email: true, phone: true } } },
    });
    if (!vendor) throw new NotFoundException('Vendor not found for this user');
    return vendor;
  }

  async createRouteAccount(userId: string, dto: CreateRouteAccountDto) {
    this.ensureV2Enabled();
    this.ensureClient();

    const vendor = await this.getVendorByUserId(userId);

    const existing = await this.prisma.vendorPayoutAccount.findUnique({
      where: { vendorId: vendor.id },
    });
    if (existing?.razorpay_account_id) {
      throw new ConflictException(
        `A Route account already exists (${existing.status}). Use the sync endpoint to refresh its status.`,
      );
    }

    const email = vendor.representative_email || vendor.user?.email;
    const phone = vendor.representative_phone || vendor.user?.phone;
    if (!email || !phone || !vendor.comp_name) {
      throw new BadRequestException(
        'Vendor profile is incomplete — email, phone, and company name are required before Route onboarding',
      );
    }

    const payload = {
      email,
      phone,
      type: 'route',
      reference_id: vendor.id,
      legal_business_name: vendor.comp_name,
      business_type: mapBusinessType(vendor.comp_type),
      contact_name: vendor.representative || vendor.comp_name,
      profile: {
        category: dto.profile_category || 'professional_services',
        subcategory: dto.profile_subcategory || 'consulting',
      },
    };

    let rzpAccount: any;
    try {
      // The SDK exposes accounts via a different namespace on older versions;
      // fall back to raw API call if accounts.create is unavailable.
      if (typeof (this.client as any).accounts?.create === 'function') {
        rzpAccount = await (this.client as any).accounts.create(payload);
      } else {
        throw new Error(
          'Razorpay SDK does not expose accounts.create — upgrade SDK or enable Route',
        );
      }
    } catch (err: any) {
      const statusCode = err?.statusCode;
      const desc = err?.error?.description || err?.message;
      this.logger.error(`accounts.create failed (${statusCode}): ${desc}`);
      // Route-not-enabled shows up as URL-not-found / 400 from Razorpay
      if (
        statusCode === 400 &&
        /requested URL was not found/i.test(desc || '')
      ) {
        throw new BadGatewayException(
          'Razorpay Route is not enabled on this merchant account yet. Please ask the admin to enable Route at razorpay.com/support.',
        );
      }
      throw new BadGatewayException(
        `Razorpay rejected the onboarding request: ${desc || 'unknown error'}`,
      );
    }

    const account = await this.prisma.vendorPayoutAccount.upsert({
      where: { vendorId: vendor.id },
      create: {
        vendorId: vendor.id,
        razorpay_account_id: rzpAccount.id,
        status: mapRazorpayStatus(rzpAccount.status),
        last_synced_at: new Date(),
      },
      update: {
        razorpay_account_id: rzpAccount.id,
        status: mapRazorpayStatus(rzpAccount.status),
        last_synced_at: new Date(),
        last_sync_error: null,
      },
    });

    return account;
  }

  async getMyAccount(userId: string) {
    this.ensureV2Enabled();

    const vendor = await this.getVendorByUserId(userId);
    const account = await this.prisma.vendorPayoutAccount.findUnique({
      where: { vendorId: vendor.id },
    });
    return account ?? null;
  }

  async syncAccountStatus(userId: string) {
    this.ensureV2Enabled();
    this.ensureClient();

    const vendor = await this.getVendorByUserId(userId);
    const account = await this.prisma.vendorPayoutAccount.findUnique({
      where: { vendorId: vendor.id },
    });
    if (!account?.razorpay_account_id) {
      throw new NotFoundException(
        'No Route account exists yet — create one first',
      );
    }

    let rzpAccount: any;
    try {
      rzpAccount = await (this.client as any).accounts.fetch(
        account.razorpay_account_id,
      );
    } catch (err: any) {
      const desc = err?.error?.description || err?.message;
      await this.prisma.vendorPayoutAccount.update({
        where: { id: account.id },
        data: {
          last_synced_at: new Date(),
          last_sync_error: String(desc).slice(0, 500),
        },
      });
      throw new BadGatewayException(`Razorpay sync failed: ${desc}`);
    }

    const newStatus = mapRazorpayStatus(rzpAccount.status);
    const activated = newStatus === RouteAccountStatus.ACTIVATED;

    const settlements =
      rzpAccount.settlements || rzpAccount?.profile?.settlements;
    const bankLast4 = settlements?.account_number
      ? String(settlements.account_number).slice(-4)
      : account.bank_account_last4;

    const updated = await this.prisma.vendorPayoutAccount.update({
      where: { id: account.id },
      data: {
        status: newStatus,
        activated_at:
          activated && !account.activated_at
            ? new Date()
            : account.activated_at,
        bank_account_last4: bankLast4 ?? undefined,
        bank_ifsc: settlements?.ifsc_code ?? account.bank_ifsc ?? undefined,
        bank_account_holder:
          settlements?.beneficiary_name ??
          account.bank_account_holder ??
          undefined,
        last_synced_at: new Date(),
        last_sync_error: null,
      },
    });

    return updated;
  }

  // Vendor self-serve: paginated history of this vendor's own payouts with
  // the milestone/order context they need to reconcile their earnings.
  // Filters kept minimal (status only) — admin gets the richer search.
  async getMyPayouts(
    userId: string,
    page: number,
    limit: number,
    status?: VendorPayoutStatus,
  ) {
    this.ensureV2Enabled();

    const vendor = await this.getVendorByUserId(userId);

    const where: Prisma.VendorPayoutWhereInput = {
      vendorId: vendor.id,
      ...(status ? { status } : {}),
    };
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.vendorPayout.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          provider_payout_id: true,
          provider_reference_id: true,
          failure_reason: true,
          createdAt: true,
          updatedAt: true,
          milestones: {
            select: {
              id: true,
              seq: true,
              title: true,
              status: true,
              vendor_amount: true,
              customer_amount: true,
              orderId: true,
              order: { select: { orderNo: true } },
            },
          },
        },
      }),
      this.prisma.vendorPayout.count({ where }),
    ]);

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      data,
    };
  }

  // Admin-side view: paginated list of every VendorPayout row with the
  // minimal context admin needs to reconcile (linked milestone, vendor,
  // order). Supports status/vendor/date filters.
  async adminList(dto: AdminPayoutListDto) {
    this.ensureV2Enabled();

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.VendorPayoutWhereInput = {
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.vendorId ? { vendorId: dto.vendorId } : {}),
      ...(dto.fromDate || dto.toDate
        ? {
            createdAt: {
              ...(dto.fromDate ? { gte: new Date(dto.fromDate) } : {}),
              ...(dto.toDate ? { lte: new Date(dto.toDate) } : {}),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.vendorPayout.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          vendorId: true,
          amount: true,
          currency: true,
          status: true,
          provider_payout_id: true,
          provider_reference_id: true,
          failure_reason: true,
          createdAt: true,
          updatedAt: true,
          vendor: { select: { comp_name: true, representative: true } },
          milestones: {
            select: {
              id: true,
              seq: true,
              title: true,
              status: true,
              customer_amount: true,
              vendor_amount: true,
              orderId: true,
              order: { select: { orderNo: true } },
            },
          },
        },
      }),
      this.prisma.vendorPayout.count({ where }),
    ]);

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      data,
    };
  }

  // Admin retries a previously failed payout. Looks at the linked milestone's
  // status to decide intent:
  //   COMPLETED → retry release (transfers.edit on_hold=false)
  //   REFUNDED  → retry reverse + refund
  // Either way, a new VendorPayout row is written by the helper; the old
  // FAILED row stays for audit.
  async adminRetry(payoutId: string) {
    this.ensureV2Enabled();

    const payout = await this.prisma.vendorPayout.findUnique({
      where: { id: payoutId },
      include: { milestones: { select: { id: true, status: true }, take: 1 } },
    });
    if (!payout) {
      throw new Error('Payout not found');
    }
    if (payout.status !== VendorPayoutStatus.FAILED) {
      throw new Error(
        `Payout is ${payout.status} — only FAILED payouts can be retried`,
      );
    }

    const milestone = payout.milestones[0];
    if (!milestone) {
      throw new Error(
        'Payout has no linked milestone — cannot determine retry action',
      );
    }

    if (milestone.status === MilestoneStatus.COMPLETED) {
      const r = await this.paymentService.releaseMilestoneTransfer(
        milestone.id,
      );
      return { action: 'release', ...r };
    }
    if (milestone.status === MilestoneStatus.REFUNDED) {
      const r = await this.paymentService.reverseMilestoneTransferAndRefund(
        milestone.id,
      );
      return { action: 'reverse+refund', ...r };
    }
    throw new Error(
      `Linked milestone is ${milestone.status} — cannot retry (expected COMPLETED or REFUNDED)`,
    );
  }

  // Streaming CSV export of the admin payouts list. Cursor-pages through
  // VendorPayout rows so memory stays flat even when the dataset grows.
  // Applies the same filters as adminList() and writes directly to the
  // provided WritableStream (the controller sets the response headers).
  async exportPayoutsCsv(
    dto: AdminPayoutListDto,
    writer: NodeJS.WritableStream,
  ) {
    this.ensureV2Enabled();

    const where: Prisma.VendorPayoutWhereInput = {
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.vendorId ? { vendorId: dto.vendorId } : {}),
      ...(dto.fromDate || dto.toDate
        ? {
            createdAt: {
              ...(dto.fromDate ? { gte: new Date(dto.fromDate) } : {}),
              ...(dto.toDate ? { lte: new Date(dto.toDate) } : {}),
            },
          }
        : {}),
    };

    const escapeCsv = (val: any) =>
      `"${String(val ?? '').replace(/"/g, '""')}"`;

    // BOM so Excel opens it as UTF-8.
    writer.write('﻿');
    writer.write(
      [
        'created_at',
        'vendor',
        'representative',
        'order_no',
        'milestone_seq',
        'milestone_title',
        'milestone_status',
        'amount_inr',
        'payout_status',
        'razorpay_transfer_id',
        'razorpay_reference_id',
        'failure_reason',
      ].join(',') + '\n',
    );

    const batchSize = 500;
    let lastCreatedAt: Date | null = null;
    let lastId: string | null = null;

    while (true) {
      const pageWhere: Prisma.VendorPayoutWhereInput = { ...where };
      if (lastCreatedAt) {
        pageWhere.OR = [
          { createdAt: { lt: lastCreatedAt } },
          {
            AND: [
              { createdAt: { equals: lastCreatedAt } },
              { id: { lt: lastId! } },
            ],
          },
        ];
      }

      const rows = await this.prisma.vendorPayout.findMany({
        where: pageWhere,
        take: batchSize,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true,
          amount: true,
          status: true,
          provider_payout_id: true,
          provider_reference_id: true,
          failure_reason: true,
          createdAt: true,
          vendor: { select: { comp_name: true, representative: true } },
          milestones: {
            select: {
              seq: true,
              title: true,
              status: true,
              order: { select: { orderNo: true } },
            },
            take: 1,
          },
        },
      });

      if (!rows.length) break;

      for (const r of rows) {
        const ms = r.milestones[0];
        const line =
          [
            escapeCsv(r.createdAt.toISOString()),
            escapeCsv(r.vendor?.comp_name),
            escapeCsv(r.vendor?.representative),
            escapeCsv(ms?.order?.orderNo),
            escapeCsv(ms?.seq),
            escapeCsv(ms?.title),
            escapeCsv(ms?.status),
            (r.amount / 100).toFixed(2),
            escapeCsv(r.status),
            escapeCsv(r.provider_payout_id),
            escapeCsv(r.provider_reference_id),
            escapeCsv(r.failure_reason),
          ].join(',') + '\n';
        writer.write(line);
      }

      const last = rows[rows.length - 1];
      lastCreatedAt = last.createdAt;
      lastId = last.id;
      if (rows.length < batchSize) break;
    }
  }
}
