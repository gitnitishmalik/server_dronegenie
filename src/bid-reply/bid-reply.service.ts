import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateBidReplyDto,
  MilestoneDto,
  UpdateBidReplyDto,
} from './dtos/bid-reply.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { DgChargeType, Prisma, ReplyStatus, UserRole } from '@prisma/client';
import { JwtPayload } from 'src/auth/types';

// cstmrPrice = what the customer pays before service-level GST is applied.
// For PERCENT services this adds a percentage of the vendor price; for FLAT
// it adds a fixed ₹ amount regardless of bid size (answer #2a from PR #2 plan).
function computeCustomerPrice(
  vendorPrice: number,
  dgCharges: number,
  type: DgChargeType,
): number {
  if (type === DgChargeType.FLAT) {
    return Number((vendorPrice + dgCharges).toFixed(2));
  }
  return Number(((dgCharges / 100) * vendorPrice + vendorPrice).toFixed(2));
}

// Validate + normalise the vendor's milestone array. We do this here instead
// of via @ValidateNested on the DTO because class-transformer strips inner
// fields under ValidationPipe({ whitelist: true }) when the source is a
// JSON-stringified multipart field (see DTO comment).
function normaliseMilestones(raw: unknown): MilestoneDto[] {
  if (!Array.isArray(raw)) {
    throw new BadRequestException('milestones must be an array');
  }
  return raw.map((m: any, i: number) => {
    if (!m || typeof m !== 'object') {
      throw new BadRequestException(`Milestone ${i + 1}: must be an object`);
    }
    const title = typeof m.title === 'string' ? m.title.trim() : '';
    if (!title) {
      throw new BadRequestException(`Milestone ${i + 1}: title is required`);
    }
    const va = Number(m.vendor_amount);
    if (!Number.isFinite(va) || va <= 0) {
      throw new BadRequestException(
        `Milestone ${i + 1}: vendor_amount must be a positive number`,
      );
    }
    const description =
      typeof m.description === 'string' && m.description.trim()
        ? m.description.trim()
        : undefined;
    return { title, description, vendor_amount: va } as MilestoneDto;
  });
}

// Sum of milestone.vendor_amount must equal dto.price exactly (to the paisa).
// We round each input to 2dp before summing so that small FE float noise
// (e.g. 0.1 + 0.2 = 0.30000000000000004) doesn't trip the validator.
function assertMilestonesSumToPrice(milestones: MilestoneDto[], price: number) {
  const sumPaise = milestones.reduce(
    (acc, m) => acc + Math.round((m.vendor_amount ?? 0) * 100),
    0,
  );
  const pricePaise = Math.round(price * 100);
  if (sumPaise !== pricePaise) {
    throw new BadRequestException(
      `Milestone vendor_amount sum (₹${(sumPaise / 100).toFixed(2)}) must equal bid price (₹${(pricePaise / 100).toFixed(2)})`,
    );
  }
}

@Injectable()
export class BidReplyService {
  constructor(private readonly prisma: PrismaService) {}

  async createBidReply(dto: CreateBidReplyDto, files?: Express.Multer.File[]) {
    // Validate bidRequest exists
    const bidRequest = await this.prisma.bidRequest.findUnique({
      where: { id: dto.bidReqId },
    });
    if (!bidRequest) throw new NotFoundException('Bid Request not found');

    // Validate vendor exists
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId: dto.userId },
    });
    if (!vendor) throw new ConflictException('Vendor not found');

    // Upload files (media)
    const uploadedMedia: string[] = [];
    if (files && files.length > 0) {
      for (const file of files) {
        const url = file.filename;
        uploadedMedia.push(url);
      }
    }

    const service = await this.prisma.droneService.findUnique({
      where: { id: bidRequest.serviceId },
    });

    if (!service) throw new NotFoundException('Service not found');

    const milestones = normaliseMilestones(dto.milestones);
    assertMilestonesSumToPrice(milestones, dto.price);

    const calculatedPrice = computeCustomerPrice(
      dto.price,
      service.dgCharges ?? 0,
      service.dgChargeType,
    );

    // Create BidReply
    const reply = await this.prisma.bidReply.create({
      data: {
        vendorId: vendor.id,
        bidReqId: dto.bidReqId,
        description: dto.description,
        media: uploadedMedia || null,
        price: dto.price,
        cstmrPrice: calculatedPrice,
        startDate: dto.startDate,
        endDate: dto.endDate,
        status: ReplyStatus.PENDING,
        proposed_milestones: milestones as unknown as Prisma.InputJsonValue,
      },
    });

    return reply;
  }

  async getByBidRequestIdForVendor(userId: string, bidRequestId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
    });
    if (!vendor) throw new ConflictException('Vendor not found');

    const bidRequest = await this.prisma.bidRequest.findUnique({
      where: { id: bidRequestId },
    });
    if (!bidRequest) throw new NotFoundException('Bid Request not found');

    const reply = await this.prisma.bidReply.findFirst({
      where: {
        bidReqId: bidRequestId,
        vendor: { userId },
      },
    });

    if (!reply) throw new NotFoundException('Bid Reply not found');

    return reply;
  }

  async getReplyByBidRequestIdForCustomer(
    bidRequestId: string,
    caller: JwtPayload,
  ) {
    const bidRequest = await this.prisma.bidRequest.findUnique({
      where: { id: bidRequestId },
      include: {
        customer: { include: { user: { select: { id: true } } } },
        service: true,
        bidReply: {
          select: {
            id: true,
            vendor: true,
            bidReqId: true,
            description: true,
            media: true,
            cstmrPrice: true,
            startDate: true,
            endDate: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!bidRequest) throw new NotFoundException('Bid Request not found');

    // Only the customer who owns this bid request can see the vendor replies
    // on it (or admin). Otherwise any logged-in customer could enumerate
    // competitors' requests and harvest pricing.
    const isAdmin = caller.role?.includes(UserRole.ADMIN);
    if (!isAdmin && bidRequest.customer?.user?.id !== caller.sub) {
      throw new ForbiddenException(
        'You can only view bid replies on your own bid requests',
      );
    }

    return bidRequest;
  }

  async update(
    id: string,
    dto: UpdateBidReplyDto,
    caller: JwtPayload,
    files?: Express.Multer.File[],
  ) {
    const bidReply = await this.prisma.bidReply.findFirst({
      where: { id },
      include: { vendor: { select: { userId: true } } },
    });
    if (!bidReply) throw new NotFoundException('Bid Reply not found');

    // Vendors can only edit their own bid replies. Without this guard any
    // vendor could PATCH another vendor's bid by guessing the id.
    const isAdmin = caller.role?.includes(UserRole.ADMIN);
    if (!isAdmin && bidReply.vendor?.userId !== caller.sub) {
      throw new ForbiddenException('You can only edit your own bid replies');
    }

    if (bidReply.status !== ReplyStatus.PENDING)
      throw new BadRequestException(
        "You can't edit a bid reply once accepted!",
      );

    const uploadedMedia: string[] = [];
    if (files?.length) {
      for (const file of files) {
        const url = file.filename; // assume this returns file URL
        uploadedMedia.push(url);
      }
    }

    const service = await this.prisma.bidRequest.findUnique({
      where: { id: bidReply.bidReqId },
      include: {
        service: {
          select: {
            id: true,
            dgCharges: true,
            dgChargeType: true,
          },
        },
      },
    });

    const price = dto.price ?? bidReply.price ?? 0;
    const dgCharges = service?.service?.dgCharges ?? 0;
    const dgChargeType = service?.service?.dgChargeType ?? DgChargeType.PERCENT;

    // Price-without-milestones drift fix: if the vendor is changing the
    // price, they must resubmit the milestone breakdown too — otherwise the
    // old milestones would silently become inconsistent with the new price.
    const priceChanged =
      dto.price !== undefined && dto.price !== bidReply.price;
    if (priceChanged && !dto.milestones) {
      throw new BadRequestException(
        'When changing the bid price you must also resubmit the milestone breakdown so the amounts stay consistent.',
      );
    }

    const normalisedMilestones = dto.milestones
      ? normaliseMilestones(dto.milestones)
      : undefined;
    if (normalisedMilestones) {
      assertMilestonesSumToPrice(normalisedMilestones, price);
    }

    const calculatedPrice = computeCustomerPrice(
      price,
      dgCharges,
      dgChargeType,
    );

    const updatedReply = await this.prisma.bidReply.update({
      where: { id: bidReply.id },
      data: {
        description: dto.description,
        media: uploadedMedia.length > 0 ? uploadedMedia : undefined,
        price: dto.price,
        cstmrPrice: calculatedPrice,
        startDate: dto.startDate,
        endDate: dto.endDate,
        ...(normalisedMilestones
          ? {
              proposed_milestones:
                normalisedMilestones as unknown as Prisma.InputJsonValue,
            }
          : {}),
      },
    });

    return updatedReply;
  }
}
