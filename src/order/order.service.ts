import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { JwtPayload } from "src/auth/types";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "src/prisma/prisma.service";
import { AdminOrderReportDto, DisputeMilestoneDto, MilestoneResolutionDecision, OrderDto, RedeemMilestoneOtpDto, ResolveMilestoneDto, UpdateOrderDto } from "./dtos/order.dto";
import { generateOrderId } from "src/common/utils/orderid.util";
import { DgChargeType, MilestoneStatus, Prisma, PrismaClient, UserRole } from "@prisma/client";
import { BidStatus, OrderStatus } from "src/common/enums";
import { Pagination } from "src/common/decorators/pagination.decorator";
import { PaginationDto } from "src/common/dto";
import { sendSMS } from "src/common/utils/send-sms.util";
import { ReplyStatus } from '@prisma/client'
import { PaymentService } from "src/payment/payment.service";
import { InvoiceService } from "src/invoice/invoice.service";
import { MailService } from "src/mail/mail.service";
import { Logger } from "@nestjs/common";


type ProposedMilestone = { title: string; description?: string | null; vendor_amount: number };
type MilestoneRow = {
  seq: number;
  title: string;
  description: string | null;
  vendor_amount: number;
  commission_amount: number;
  gst_amount: number;
  customer_amount: number;
};


// Split an order's pricing into N OrderMilestone rows. Per-row amounts are
// rounded to 2dp; any rounding residue is absorbed into the last row's
// commission/gst/customer so sums exactly match the Order totals.
//
// Commission rules:
//   PERCENT — commission per row = vendor_amount × dgVal / 100
//   FLAT    — commission per row = dgVal × (vendor_amount / Σvendor_amount)   (pro-rata)
function buildMilestoneRows(args: {
  proposed: unknown;
  fallbackTitle: string;
  ven_price: number;
  cust_price: number;
  gstPct: number;
  dgType: DgChargeType;
  dgVal: number;
}): MilestoneRow[] {
  const { proposed, fallbackTitle, ven_price, cust_price, gstPct, dgType, dgVal } = args;

  const hasProposed = Array.isArray(proposed) && proposed.length > 0;
  const input: ProposedMilestone[] = hasProposed
    ? (proposed as ProposedMilestone[])
    : [{ title: fallbackTitle, vendor_amount: ven_price }];

  const sumVendor = input.reduce((acc, m) => acc + (m.vendor_amount ?? 0), 0);

  const r2 = (n: number) => Math.round(n * 100) / 100;

  const rows: MilestoneRow[] = input.map((m, i) => {
    const va = m.vendor_amount ?? 0;
    const commission = dgType === DgChargeType.FLAT
      ? (sumVendor > 0 ? dgVal * (va / sumVendor) : 0)
      : va * dgVal / 100;
    const gst_amount = (va + commission) * gstPct / 100;
    const customer_amount = va + commission + gst_amount;
    return {
      seq: i + 1,
      title: m.title,
      description: m.description ?? null,
      vendor_amount: r2(va),
      commission_amount: r2(commission),
      gst_amount: r2(gst_amount),
      customer_amount: r2(customer_amount),
    };
  });

  // Absorb rounding delta into the last row's commission/gst/customer so that
  // Σ(commission) = cust_price - ven_price  and  Σ(customer) = cust_total.
  // vendor_amount stays untouched — the vendor proposed those exact numbers.
  if (rows.length > 0) {
    const targetMargin = r2(cust_price - ven_price);
    const targetGst = r2(cust_price * gstPct / 100);
    const head = rows.slice(0, -1);
    const last = rows[rows.length - 1];
    const sumHeadMargin = head.reduce((a, r) => a + r.commission_amount, 0);
    const sumHeadGst = head.reduce((a, r) => a + r.gst_amount, 0);
    last.commission_amount = r2(targetMargin - sumHeadMargin);
    last.gst_amount = r2(targetGst - sumHeadGst);
    last.customer_amount = r2(last.vendor_amount + last.commission_amount + last.gst_amount);
  }

  return rows;
}


@Injectable({})
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly paymentService: PaymentService,
    private readonly invoiceService: InvoiceService,
    private readonly mailService: MailService,
  ) { }

  // Fire both vendor + customer invoice generation. The underlying
  // generateInvoice() is idempotent (no-op if the invoice row already
  // exists on the Order), so running this on every completion path is
  // safe. Errors are swallowed + logged — invoice generation must never
  // block an order from completing.
  //
  // When a fresh invoice is generated, the PDF buffer is emailed to the
  // party. generateInvoice() only returns a record on first generation,
  // so this naturally dispatches each invoice exactly once per order.
  private async tryAutoGenerateInvoices(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        orderNo: true,
        vendor: { select: { representative: true, representative_email: true, comp_name: true } },
        customer: { select: { representative: true, representative_email: true, comp_name: true } },
      },
    });
    const orderNo = order?.orderNo ?? orderId;

    try {
      const res = await this.invoiceService.generateInvoice({ orderId }, UserRole.VENDOR);
      const rec = res?.vendorInvoiceRecord;
      if (rec?.buffer && order?.vendor?.representative_email) {
        await this.mailService.sendInvoiceEmail(
          order.vendor.representative_email,
          order.vendor.representative || order.vendor.comp_name || 'Vendor',
          rec.invoice.seed ? `${rec.invoice.seed}-${String(rec.invoice.latest).padStart(4, '0')}` : rec.fileName,
          orderNo,
          'VENDOR',
          rec.buffer,
          rec.fileName,
        );
      }
    } catch (err: any) {
      this.logger.error(`auto-invoice VENDOR failed for order=${orderId}: ${err?.message}`);
    }

    try {
      const res = await this.invoiceService.generateInvoice({ orderId }, UserRole.CUSTOMER);
      const rec = res?.customerInvoiceRecord;
      if (rec?.buffer && order?.customer?.representative_email) {
        await this.mailService.sendInvoiceEmail(
          order.customer.representative_email,
          order.customer.representative || order.customer.comp_name || 'Customer',
          rec.invoice.seed ? `${rec.invoice.seed}-${String(rec.invoice.latest).padStart(4, '0')}` : rec.fileName,
          orderNo,
          'CUSTOMER',
          rec.buffer,
          rec.fileName,
        );
      }
    } catch (err: any) {
      this.logger.error(`auto-invoice CUSTOMER failed for order=${orderId}: ${err?.message}`);
    }
  }

  private generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Milestone-level actions (redeem, dispute) are hidden behind the same
  // PAYMENTS_V2_ENABLED flag as the customer-side pay endpoints. Throwing
  // NotFoundException keeps the feature invisible when OFF.
  private ensureV2Enabled() {
    const on = this.config.get<string>('PAYMENTS_V2_ENABLED') === 'true';
    if (!on) {
      throw new NotFoundException('Cannot find this route');
    }
  }


  private async getNextOrderSequence(tx: PrismaClient | Prisma.TransactionClient, year: number) {
    const existing = await tx.orderCounter.findUnique({ where: { year } });

    if (!existing) {
      const created = await tx.orderCounter.create({ data: { year, seq: 1 } });
      return created.seq;
    }

    const updated = await tx.orderCounter.update({
      where: { year },
      data: { seq: existing.seq + 1 },
    });

    return updated.seq;
  }



  async create(bidReplyId: string, caller: JwtPayload) {
    const isAdmin = caller.role?.includes(UserRole.ADMIN);

    // Phase 1: do all DB mutations in a single transaction so the
    // order/milestones/bid-request/bid-reply status changes are atomic.
    const { order, customerPhone, otp } = await this.prisma.$transaction(async (tx) => {
      const bidReply = await tx.bidReply.findUniqueOrThrow({
        where: { id: bidReplyId },
        include: {
          vendor: true,
          bidRequests: {
            include: {
              customer: {
                include: {
                  user: { select: { id: true, phone: true, email: true } },
                },
              },
              service: true,
            },
          },
        },
      });

      const { vendor, bidRequests } = bidReply;
      const { customer, service } = bidRequests;

      // Ownership: only the customer who created this bid request can accept
      // bids on it. Admin bypasses for ops-team scenarios.
      if (!isAdmin && customer.user?.id !== caller.sub) {
        throw new ForbiddenException(
          'Only the customer who created this bid request can accept bids on it',
        );
      }

      // Idempotency / race guards — must be PENDING on both ends.
      if (bidReply.status !== ReplyStatus.PENDING) {
        throw new BadRequestException(
          `Bid reply is ${bidReply.status}; only PENDING bids can be accepted`,
        );
      }
      if (bidRequests.status !== BidStatus.PENDING) {
        throw new BadRequestException(
          `Bid request is ${bidRequests.status}; another bid has already been awarded`,
        );
      }

      const gst = service?.gst ?? 0;
      const cust_price = bidReply.cstmrPrice ?? 0;
      const ven_price = bidReply.price ?? 0;

      const cust_total = cust_price + (gst / 100) * cust_price;
      const ven_total = ven_price + (gst / 100) * ven_price;
      const dg_margin = cust_total - ven_total;

      // 2️⃣ Generate OTP
      const otp = this.generateOTP();

      // 3️⃣ Generate order number (SAFE)
      const year = new Date().getFullYear();
      const seq = await this.getNextOrderSequence(tx, year);
      const padded = String(seq).padStart(4, '0');
      const orderNo = `OD-${year}-${padded}`;

      // 3.5️⃣ Build OrderMilestone breakdown from the vendor's proposed milestones.
      // Pre-PR #2 bids have no proposed_milestones — we synthesize a single milestone
      // covering the full bid so every Order has ≥1 OrderMilestone row going forward.
      const milestoneRows = buildMilestoneRows({
        proposed: bidReply.proposed_milestones,
        fallbackTitle: service!.service_name ?? 'Project',
        ven_price,
        cust_price,
        gstPct: gst,
        dgType: service!.dgChargeType,
        dgVal: service!.dgCharges ?? 0,
      });

      // 4️⃣ Create order (with nested milestones + frozen commission terms)
      const order = await tx.order.create({
        data: {
          orderNo,
          serviceId: service!.id,
          service_name: service!.service_name,
          service_desc: service!.description ?? 'N/A',
          startDate: bidReply.startDate,
          endDate: bidReply.endDate,
          job_desc: bidReply.description ?? 'N/A',
          bidReqId: bidRequests.id,
          vendorId: vendor.id,
          customerId: customer.id,

          vendor_gst: gst,
          vendor_price: Number(ven_price.toFixed(2)),

          dg_charges: service!.dgCharges ?? 0,
          dg_gst: gst,
          dg_price: Number(cust_price.toFixed(2)),

          vendor_total: Number(ven_total.toFixed(2)),
          customer_total: Number(cust_total.toFixed(2)),
          dg_margin: Number(dg_margin.toFixed(2)),

          // Freeze commission terms at accept-time so later DroneService edits
          // don't rewrite history (Payments v2 schema — still no runtime behaviour).
          dg_commission_snapshot_type: service!.dgChargeType,
          dg_commission_snapshot_value: service!.dgCharges ?? 0,

          milestones: { create: milestoneRows },

          otp,
          status: OrderStatus.PENDING,
        },
      });

      // 5️⃣ Update bid + request status
      await tx.bidRequest.update({
        where: { id: bidRequests.id },
        data: { status: BidStatus.AWARDED },
      });

      await tx.bidReply.update({
        where: { id: bidReply.id },
        data: { status: ReplyStatus.ACCEPTED },
      });

      // Auto-reject sibling bids on the same request so vendors see a clear
      // outcome instead of being stuck in PENDING forever.
      await tx.bidReply.updateMany({
        where: {
          bidReqId: bidRequests.id,
          id: { not: bidReply.id },
          status: ReplyStatus.PENDING,
        },
        data: { status: ReplyStatus.REJECTED },
      });

      const customerPhone =
        customer.user?.phone?.trim() ||
        customer.representative_phone?.trim() ||
        '';

      return { order, customerPhone, otp };
    });

    // Phase 2: SMS is best-effort and MUST NOT roll back the order. If
    // Fast2SMS is down or the phone is missing, the order still stands and
    // we log a warning for ops to follow up.
    if (customerPhone) {
      try {
        await sendSMS(customerPhone, otp);
      } catch (e) {
        console.warn(
          `[order.create] OTP SMS failed for order ${order.orderNo} (${customerPhone}):`,
          (e as Error).message,
        );
      }
    } else {
      console.warn(
        `[order.create] Order ${order.orderNo} created but no customer phone on file — OTP not sent`,
      );
    }

    return order;
  }



  // @Pagination(['service_name', 'service_desc', 'job_desc', 'orderNo', 'payment_method', 'transactionId'])
  // async getAllOrderForVendor(
  //   dto: PaginationDto,
  //   modelName: string,
  //   queryOptions: any): Promise<{
  //     total: number;
  //     page: number;
  //     limit: number;
  //     data: any[];
  //   }> {
  //   return {
  //     total: 0,
  //     page: 0,
  //     limit: 0,
  //     data: [],
  //   };
  // }

  async getAllOrderForVendor(dto: PaginationDto, vendorId: string) {
    try {
      const page = dto.page ? parseInt(dto.page) : 1;
      const limit = dto.limit ? parseInt(dto.limit) : 10;
      const skip = (page - 1) * limit;


      let customerIds: string[] = [];

      if (dto.search) {
        const customers = await this.prisma.customer.findMany({
          where: {
            OR: [
              {
                representative: {
                  contains: dto.search,
                  mode: 'insensitive',
                },
              },
              {
                user: {
                  name: {
                    contains: dto.search,
                    mode: 'insensitive',
                  },
                },
              },
            ],
          },
          select: { id: true },
        });

        customerIds = customers.map(c => c.id);
      }


      const where: Prisma.OrderWhereInput = {
        vendorId,
        ...(dto.search && {
          OR: [
            {
              service_name: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            {
              service_desc: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            {
              job_desc: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            ...(customerIds.length
              ? [
                {
                  customerId: {
                    in: customerIds,
                  },
                },
              ]
              : []),
          ],
        }),
      };


      const data = await this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderNo: true,
          serviceId: true,
          service_name: true,
          service_desc: true,
          startDate: true,
          endDate: true,
          job_desc: true,
          bidReqId: true,
          customerId: true,
          vendor_gst: true,
          vendor_price: true,
          vendor_total: true,
          status: true,
          transactionId: true,
          transaction_date: true,
          payment_method: true,
          vendor_invoice_id: true,
          createdAt: true,
          vendor: {
            select: {
              id: true,
              comp_name: true,
              comp_type: true,
              representative: true,
              representative_email: true,
              representative_phone: true,
            },
          },
          customer: {
            select: {
              id: true,
              comp_name: true,
              comp_type: true,
              representative: true,
              representative_email: true,
              representative_phone: true,
            },
          },
          bidRequest: {
            select: {
              id: true,
              area: true,
              unit: true,
              media: true,
              location: true,
              status: true,
              description: true,
            },
          },
          vendor_invoice: true,
        },
      });

      // 🔥 SAFE COUNT
      let total: number;

      if (dto.search) {
        // Prisma MongoDB bug workaround
        total = (
          await this.prisma.order.findMany({
            where,
            select: { id: true },
          })
        ).length;
      } else {
        // Normal count works fine
        total = await this.prisma.order.count({ where });
      }

      return {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data,
      };
    } catch (error) {
      throw error;
    }
  }



  // @Pagination(['service_name', 'service_desc', 'job_desc', 'orderNo', 'payment_method', 'transactionId'])
  // async getAllOrderForCustomer(
  //     dto: PaginationDto,
  //     modelName: string,
  //     queryOptions: any): Promise<{
  //         total: number;
  //         page: number;
  //         limit: number;
  //         data: any[];
  //     }> {
  //     return {
  //         total: 0,
  //         page: 0,
  //         limit: 0,
  //         data: [],
  //     };
  // }

  async getAllOrderForCustomer(dto: PaginationDto, customerId: string) {
    try {
      const page = dto.page ? parseInt(dto.page) : 1;
      const limit = dto.limit ? parseInt(dto.limit) : 10;
      const skip = (page - 1) * limit;

      const where: Prisma.OrderWhereInput = {
        customerId,
        ...(dto.search && {
          OR: [
            {
              service_name: {
                contains: dto.search,
                mode: 'insensitive',

              },
            },
            {
              service_desc: {
                contains: dto.search,
                mode: 'insensitive',

              },
            },
            {
              job_desc: {
                contains: dto.search,
                mode: 'insensitive',

              },
            },
            {
              vendor: {
                user: {
                  name: {
                    contains: dto.search,
                    mode: 'insensitive',
                  },
                },
              },
            },
          ],
        }),
      };

      const [data, total] = await Promise.all([
        this.prisma.order.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            createdAt: 'desc',
          },
          select: {
            id: true,
            orderNo: true,
            serviceId: true,
            service_name: true,
            service_desc: true,
            startDate: true,
            endDate: true,
            job_desc: true,
            bidReqId: true,
            customerId: true,
            dg_gst: true,
            dg_charges: true,
            dg_price: true,
            customer_total: true,
            status: true,
            transactionId: true,
            transaction_date: true,
            payment_method: true,
            otp: true,
            customer_invoice_id: true,
            createdAt: true,
            vendor: {
              select: {
                id: true,
                comp_name: true,
                comp_type: true,
                representative: true,
                representative_email: true,
                representative_phone: true,
                user: {
                  select: {
                    id: true,
                    name: true
                  }

                }
              }
            },
            customer: {
              select: {
                id: true,
                comp_name: true,
                comp_type: true,
                representative: true,
                representative_email: true,
                representative_phone: true
              }
            },
            bidRequest: {
              select: {
                id: true,
                area: true,
                unit: true,
                media: true,
                location: true,
                status: true,
                description: true,
              }

            },
            customer_invoice: true,
          }
        }),
        this.prisma.order.count({ where }),
      ]);

      return {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data
      };
    } catch (error) {
      throw error;
    }
  }


  // @Pagination(['service_name', 'service_desc', 'job_desc', 'orderNo', 'payment_method', 'transactionId'])
  // async getAll(
  //   dto: PaginationDto,
  //   modelName: string,
  //   queryOptions: any): Promise<{
  //     total: number;
  //     page: number;
  //     limit: number;
  //     data: any[];
  //   }> {
  //   return {
  //     total: 0,
  //     page: 0,
  //     limit: 0,
  //     data: [],
  //   };
  // }

  async getAll(dto: PaginationDto) {
    try {
      const page = dto.page ? parseInt(dto.page) : 1;
      const limit = dto.limit ? parseInt(dto.limit) : 10;
      const skip = (page - 1) * limit;

      const where: Prisma.OrderWhereInput = {
        ...(dto.search && {
          OR: [
            {
              service_name: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            {
              service_desc: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            {
              job_desc: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            {
              vendor: {
                user: {
                  name: {
                    contains: dto.search,
                    mode: 'insensitive',
                  },
                },
              },
            },
            {
              customer: {
                user: {
                  name: {
                    contains: dto.search,
                    mode: 'insensitive',
                  },
                },
              },
            },
          ],
        }),
      };

      const [data, total] = await Promise.all([
        this.prisma.order.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            service: true,
            bidRequest: true,
            vendor: {
              include: {
                user: true,
              }
            },
            customer: {
              include: {
                user: true,
              }
            },
            customer_invoice: true,
            vendor_invoice: true
          }
        }),
        this.prisma.order.count({ where }),
      ]);

      return {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data
      };
    } catch (error) {
      throw error;
    }
  }

  async completeOrder(id: string, dto: UpdateOrderDto, caller: JwtPayload) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { vendor: { select: { userId: true } } },
    })

    if (!order) {
      throw new NotFoundException("Order Not Found");
    }

    // Vendors can only complete their own orders. The OTP came from the
    // customer via SMS — the vendor presents it to mark work done.
    const isAdmin = caller.role?.includes(UserRole.ADMIN);
    if (!isAdmin && order.vendor?.userId !== caller.sub) {
      throw new ForbiddenException('You can only complete orders assigned to you');
    }

    const isOtpMatch = order.otp === dto.otp;

    if (!isOtpMatch) {
      throw new BadRequestException("Invalid OTP");
    }

    const compeltedOrder = await this.prisma.order.update({
      where: { id },
      data: {
        otp: "",
        status: OrderStatus.COMPLETED
      }
    })

    // Fire auto-invoice generation off the critical path. Best-effort; errors
    // are logged inside the helper. Vendor + customer PDFs will exist on first
    // invoice download without user action.
    await this.tryAutoGenerateInvoices(compeltedOrder.id);

    return compeltedOrder;
  }


  async getOrderById(id: string) {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id },
        include: {
          service: true,
          bidRequest: true,
          vendor: true,
          customer: true,
          vendor_invoice: true,
          customer_invoice: true,
          milestones: { orderBy: { seq: 'asc' } },
        }
      })

      if (!order) {
        throw new NotFoundException("Order not found");
      }

      return order;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException("Internal server error")
    }
  }


  async getOrderByIdForCustomer(id: string, caller: JwtPayload) {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id },
        select: {
          id: true,
          orderNo: true,
          service_name: true,
          service_desc: true,
          startDate: true,
          endDate: true,
          job_desc: true,
          customer_total: true,
          status: true,
          payment_method: true,
          // OTP is never returned to the customer-facing detail endpoint.
          // It is SMS-delivered only; exposing it here would let a response
          // snooper (or cache) replay it to mark the order complete.
          transaction_date: true,
          transactionId: true,
          service: true,
          bidRequest: true,
          // Include payout_account.status so the customer FE can disable the
          // Pay button when the vendor hasn't completed Route onboarding.
          // BE already rejects in createMilestonePaymentOrder; surfacing
          // status here replaces the click-then-error round trip.
          vendor: { include: { payout_account: { select: { status: true, activated_at: true } } } },
          customer: { include: { user: { select: { id: true } } } },
          customer_invoice: true,
          milestones: { orderBy: { seq: 'asc' } },
        }
      })

      if (!order) {
        throw new NotFoundException("Order not found");
      }

      const isAdmin = caller.role?.includes(UserRole.ADMIN);
      if (!isAdmin && order.customer?.user?.id !== caller.sub) {
        throw new ForbiddenException('You can only view your own orders');
      }

      return order;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException("Internal server error")
    }
  }


  async getOrderByIdForVendor(id: string, caller: JwtPayload) {
    try {
      const order = await this.prisma.order.findUnique({
        where: { id },
        select: {
          id: true,
          orderNo: true,
          service_name: true,
          service_desc: true,
          startDate: true,
          endDate: true,
          job_desc: true,
          status: true,
          vendor_gst: true,
          vendor_price: true,
          vendor_total: true,
          payment_method: true,
          transaction_date: true,
          transactionId: true,
          service: true,
          bidRequest: true,
          vendor: { include: { user: { select: { id: true } } } },
          customer: true,
          vendor_invoice: true,
          milestones: { orderBy: { seq: 'asc' } },
        }
      })

      if (!order) {
        throw new NotFoundException("Order not found");
      }

      const isAdmin = caller.role?.includes(UserRole.ADMIN);
      if (!isAdmin && order.vendor?.user?.id !== caller.sub) {
        throw new ForbiddenException('You can only view your own orders');
      }

      return order;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException("Internal server error")
    }
  }


  async getReport(dto: AdminOrderReportDto) {
    try {
      const page = dto.page ? Number(dto.page) : 1;
      const limit = dto.limit ? Number(dto.limit) : 10;
      const skip = (page - 1) * limit;

      /* --------------------------------------------------
         1️⃣ Resolve category → serviceIds
      -------------------------------------------------- */
      let categoryServiceIds: string[] = [];

      if (dto.categoryId) {
        const categoryServices = await this.prisma.droneServiceCategory.findMany({
          where: {
            categoryId: dto.categoryId,
          },
          select: {
            serviceId: true,
          },
        });

        categoryServiceIds = categoryServices
          .map(cs => cs.serviceId)
          .filter(Boolean) as string[];
      }

      /* --------------------------------------------------
         2️⃣ Resolve industry → serviceIds
      -------------------------------------------------- */
      let industryServiceIds: string[] = [];

      if (dto.industryId) {
        const industryServices = await this.prisma.droneServiceIndustry.findMany({
          where: {
            industryId: dto.industryId,
          },
          select: {
            serviceId: true,
          },
        });

        industryServiceIds = industryServices
          .map(is => is.serviceId)
          .filter(Boolean) as string[];
      }

      /* --------------------------------------------------
         3️⃣ Build SAFE where condition
         (NO nested relation filters)
      -------------------------------------------------- */
      const where: Prisma.OrderWhereInput = {
        ...(dto.status && { status: dto.status }),

        ...(dto.fromDate || dto.toDate
          ? {
            createdAt: {
              ...(dto.fromDate && { gte: new Date(dto.fromDate) }),
              ...(dto.toDate && { lte: new Date(dto.toDate) }),
            },
          }
          : {}),

        ...(dto.categoryId || dto.industryId
          ? {
            serviceId: {
              in: [
                ...(dto.categoryId ? categoryServiceIds : []),
                ...(dto.industryId ? industryServiceIds : []),
              ],
            },
          }
          : {}),

        ...(dto.search && {
          OR: [
            {
              orderNo: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            {
              service_name: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            {
              transactionId: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
          ],
        }),
      };

      /* --------------------------------------------------
         4️⃣ Fetch Orders
      -------------------------------------------------- */
      const data = await this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderNo: true,
          createdAt: true,
          status: true,

          service_name: true,

          vendor_total: true,
          dg_price: true,
          customer_total: true,
          vendor_gst: true,
          dg_gst: true,

          payment_method: true,
          transactionId: true,

          vendor: {
            select: {
              comp_name: true,
            },
          },
          customer: {
            select: {
              comp_name: true,
            },
          },
        },
      });

      const total = dto.search || dto.categoryId || dto.industryId
        ? (
          await this.prisma.order.findMany({
            where,
            select: { id: true },
          })
        ).length
        : await this.prisma.order.count({ where });

      return {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data,
      };
    } catch (error) {
      throw error;
    }
  }


  async exportOrderReportCsv(
    dto: AdminOrderReportDto,
    writer: NodeJS.WritableStream,
  ) {
    try {
      const fromDate = dto.fromDate ? new Date(dto.fromDate) : null;
      const toDate = dto.toDate ? new Date(dto.toDate) : null;

      if (fromDate && toDate && fromDate > toDate) {
        throw new BadRequestException('fromDate must be before toDate');
      }

      writer.write('\uFEFF');
      writer.write([
        'orderNo',
        'orderDate',
        'status',
        'serviceName',
        'vendorName',
        'customerName',
        'vendorAmount',
        'dgCharges',
        'totalAmount',
        'gstAmount',
        'paymentMethod',
        'transactionId',
        // 'vendorInvoiceId',
        // 'customerInvoiceId',
      ].join(',') + '\n');

      /* --------------------------------------------------
         3️⃣ Resolve category → serviceIds
      -------------------------------------------------- */
      let categoryServiceIds: string[] = [];

      if (dto.categoryId) {
        const rows = await this.prisma.droneServiceCategory.findMany({
          where: { categoryId: dto.categoryId },
          select: { serviceId: true },
        });

        categoryServiceIds = rows.map(r => r.serviceId!).filter(Boolean);
      }

      /* --------------------------------------------------
         4️⃣ Resolve industry → serviceIds
      -------------------------------------------------- */
      let industryServiceIds: string[] = [];

      if (dto.industryId) {
        const rows = await this.prisma.droneServiceIndustry.findMany({
          where: { industryId: dto.industryId },
          select: { serviceId: true },
        });

        industryServiceIds = rows.map(r => r.serviceId!).filter(Boolean);
      }

      /* --------------------------------------------------
         5️⃣ Base where (Mongo-safe)
      -------------------------------------------------- */
      const baseWhere: Prisma.OrderWhereInput = {
        ...(dto.status && { status: dto.status }),

        ...(fromDate || toDate
          ? {
            createdAt: {
              ...(fromDate && { gte: fromDate }),
              ...(toDate && { lte: toDate }),
            },
          }
          : {}),

        ...(dto.categoryId || dto.industryId
          ? {
            serviceId: {
              in: [
                ...(dto.categoryId ? categoryServiceIds : []),
                ...(dto.industryId ? industryServiceIds : []),
              ],
            },
          }
          : {}),

        ...(dto.search && {
          OR: [
            {
              orderNo: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            {
              service_name: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            {
              transactionId: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
          ],
        }),
      };

      /* --------------------------------------------------
         6️⃣ Cursor pagination (safe for large exports)
      -------------------------------------------------- */
      const batchSize = 500;
      let lastCreatedAt: Date | null = null;
      let lastId: string | null = null;

      const escapeCsv = (val: any) =>
        `"${String(val ?? '').replace(/"/g, '""')}"`;

      while (true) {
        const pageWhere: Prisma.OrderWhereInput = { ...baseWhere };

        if (lastCreatedAt) {
          pageWhere.OR = [
            { createdAt: { gt: lastCreatedAt } },
            {
              AND: [
                { createdAt: { equals: lastCreatedAt } },
                { id: { gt: lastId! } },
              ],
            },
          ];
        }

        const rows = await this.prisma.order.findMany({
          where: pageWhere,
          take: batchSize,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            orderNo: true,
            createdAt: true,
            status: true,

            service_name: true,

            vendor_total: true,
            dg_price: true,
            customer_total: true,
            vendor_gst: true,
            dg_gst: true,

            payment_method: true,
            transactionId: true,

            vendor_invoice_id: true,
            customer_invoice_id: true,

            vendor: { select: { comp_name: true } },
            customer: { select: { comp_name: true } },
          },
        });

        if (!rows.length) break;

        for (const o of rows) {
          const gstTotal =
            Number(o.vendor_gst ?? 0) + Number(o.dg_gst ?? 0);

          const row = [
            escapeCsv(o.orderNo),
            escapeCsv(o.createdAt.toISOString()),
            escapeCsv(o.status),
            escapeCsv(o.service_name),
            escapeCsv(o.vendor?.comp_name),
            escapeCsv(o.customer?.comp_name),
            String(o.vendor_total ?? 0),
            String(o.dg_price ?? 0),
            String(o.customer_total ?? 0),
            String(gstTotal),
            escapeCsv(o.payment_method),
            escapeCsv(o.transactionId),
            // escapeCsv(o.vendor_invoice_id),
            // escapeCsv(o.customer_invoice_id),
          ].join(',') + '\n';

          writer.write(row);
        }

        const last = rows[rows.length - 1];
        lastCreatedAt = last.createdAt;
        lastId = last.id;

        if (rows.length < batchSize) break;
      }
    } catch (err) {
      if (err instanceof HttpException) throw err;
      console.error('exportOrderReport failed:', err);
      throw new InternalServerErrorException('Failed to export orders');
    }
  }


  // Vendor submits the OTP the customer received when they paid this
  // milestone. If the OTP matches, milestone flips OTP_ISSUED → COMPLETED.
  // When the last remaining milestone completes, the parent Order flips
  // to COMPLETED automatically — retiring the legacy order-level OTP flow
  // on V2-orders without removing the old endpoint.
  async redeemMilestoneOtp(milestoneId: string, userId: string, dto: RedeemMilestoneOtpDto) {
    this.ensureV2Enabled();

    const milestone = await this.prisma.orderMilestone.findUnique({
      where: { id: milestoneId },
      include: {
        order: {
          select: {
            id: true,
            status: true,
            vendor: { select: { userId: true } },
          },
        },
      },
    });
    if (!milestone) throw new NotFoundException('Milestone not found');
    if (milestone.order.vendor?.userId !== userId) {
      throw new ForbiddenException('This milestone does not belong to you');
    }
    if (milestone.status !== MilestoneStatus.OTP_ISSUED) {
      throw new ConflictException(
        `Milestone is ${milestone.status} — only OTP_ISSUED milestones can be redeemed`,
      );
    }
    if ((milestone.otp || '').trim() !== dto.otp.trim()) {
      throw new BadRequestException('Invalid OTP');
    }

    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      // Mark this milestone COMPLETED and blank the OTP.
      await tx.orderMilestone.update({
        where: { id: milestone.id },
        data: {
          status: MilestoneStatus.COMPLETED,
          otp_redeemed_at: now,
          otp: null,
        },
      });

      // Auto-complete the parent Order when every milestone has landed
      // in a terminal state (COMPLETED or REFUNDED). A DISPUTED milestone
      // blocks completion until admin resolves in PR #6.
      const siblings = await tx.orderMilestone.findMany({
        where: { orderId: milestone.order.id },
        select: { status: true },
      });
      const allTerminal = siblings.every(
        (m) =>
          m.status === MilestoneStatus.COMPLETED ||
          m.status === MilestoneStatus.REFUNDED,
      );
      const anyRefunded = siblings.some(
        (m) => m.status === MilestoneStatus.REFUNDED,
      );

      let orderCompleted = false;
      if (allTerminal && !anyRefunded && milestone.order.status !== 'COMPLETED') {
        await tx.order.update({
          where: { id: milestone.order.id },
          data: { status: 'COMPLETED' as any },
        });
        orderCompleted = true;
      }

      return { orderCompleted };
    });

    // Release the Route on_hold transfer outside the tx. If Razorpay is
    // unreachable, the milestone stays COMPLETED but a FAILED VendorPayout
    // row is written so admin can retry without data loss.
    const release = await this.paymentService.releaseMilestoneTransfer(milestone.id);

    // If this redemption just closed out the last milestone, pre-generate
    // both invoice PDFs so the customer/vendor see them immediately.
    if (result.orderCompleted) {
      await this.tryAutoGenerateInvoices(milestone.orderId);
    }

    return {
      success: true,
      milestoneId: milestone.id,
      status: MilestoneStatus.COMPLETED,
      orderCompleted: result.orderCompleted,
      payoutReleased: release.released,
      payoutId: release.payoutId,
      ...(release.released ? {} : { payoutWarning: release.reason }),
    };
  }


  // Customer raises a dispute on a milestone they've paid for but not
  // yet accepted (status=OTP_ISSUED). Freezes the milestone in DISPUTED —
  // no further vendor/customer action until admin resolves in PR #6.
  async disputeMilestone(milestoneId: string, userId: string, dto: DisputeMilestoneDto) {
    this.ensureV2Enabled();

    const milestone = await this.prisma.orderMilestone.findUnique({
      where: { id: milestoneId },
      include: {
        order: {
          select: {
            customer: { select: { userId: true } },
          },
        },
      },
    });
    if (!milestone) throw new NotFoundException('Milestone not found');
    if (milestone.order.customer?.userId !== userId) {
      throw new ForbiddenException('This milestone does not belong to you');
    }
    if (milestone.status !== MilestoneStatus.OTP_ISSUED) {
      throw new ConflictException(
        `Milestone is ${milestone.status} — only paid (OTP_ISSUED) milestones can be disputed`,
      );
    }

    await this.prisma.orderMilestone.update({
      where: { id: milestone.id },
      data: {
        status: MilestoneStatus.DISPUTED,
        disputed_reason: dto.reason,
      },
    });

    return {
      success: true,
      milestoneId: milestone.id,
      status: MilestoneStatus.DISPUTED,
    };
  }


  // Admin resolves a dispute. FAVOR_VENDOR releases the held transfer to the
  // vendor; REFUND reverses the transfer and refunds the customer. Either way
  // the milestone lands in a terminal state and is no longer DISPUTED.
  async resolveDispute(milestoneId: string, dto: ResolveMilestoneDto) {
    this.ensureV2Enabled();

    const milestone = await this.prisma.orderMilestone.findUnique({
      where: { id: milestoneId },
    });
    if (!milestone) throw new NotFoundException('Milestone not found');
    if (milestone.status !== MilestoneStatus.DISPUTED) {
      throw new ConflictException(
        `Milestone is ${milestone.status} — only DISPUTED milestones can be resolved`,
      );
    }

    if (dto.decision === MilestoneResolutionDecision.FAVOR_VENDOR) {
      // Move milestone to COMPLETED and release the Route transfer exactly
      // like the vendor's own OTP redemption would have done.
      const now = new Date();
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.orderMilestone.update({
          where: { id: milestone.id },
          data: {
            status: MilestoneStatus.COMPLETED,
            otp_redeemed_at: now,
            otp: null,
            disputed_reason: null,
            refund_note: dto.note ?? null,
          },
        });

        const siblings = await tx.orderMilestone.findMany({
          where: { orderId: milestone.orderId },
          select: { status: true },
        });
        const allTerminal = siblings.every(
          (m) =>
            m.status === MilestoneStatus.COMPLETED ||
            m.status === MilestoneStatus.REFUNDED,
        );
        const anyRefunded = siblings.some((m) => m.status === MilestoneStatus.REFUNDED);

        let orderCompleted = false;
        if (allTerminal && !anyRefunded) {
          await tx.order.update({
            where: { id: milestone.orderId },
            data: { status: 'COMPLETED' as any },
          });
          orderCompleted = true;
        }
        return { orderCompleted };
      });

      const release = await this.paymentService.releaseMilestoneTransfer(milestone.id);

      // If admin's FAVOR_VENDOR ruling closed the order, pre-generate invoices.
      if (result.orderCompleted) {
        await this.tryAutoGenerateInvoices(milestone.orderId);
      }

      return {
        success: true,
        milestoneId: milestone.id,
        decision: MilestoneResolutionDecision.FAVOR_VENDOR,
        status: MilestoneStatus.COMPLETED,
        orderCompleted: result.orderCompleted,
        payoutReleased: release.released,
        payoutId: release.payoutId,
        ...(release.released ? {} : { payoutWarning: release.reason }),
      };
    }

    // REFUND path
    await this.prisma.orderMilestone.update({
      where: { id: milestone.id },
      data: {
        status: MilestoneStatus.REFUNDED,
        refund_note: dto.note ?? null,
      },
    });

    const refund = await this.paymentService.reverseMilestoneTransferAndRefund(milestone.id);

    return {
      success: true,
      milestoneId: milestone.id,
      decision: MilestoneResolutionDecision.REFUND,
      status: MilestoneStatus.REFUNDED,
      transferReversed: refund.transferReversed,
      paymentRefunded: refund.paymentRefunded,
      refundId: refund.refundId,
      ...(refund.warnings.length ? { warnings: refund.warnings } : {}),
    };
  }

}