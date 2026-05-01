import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  HttpException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateVendorDto, QueryFilterDto, VendorProfileDto } from './dtos';
import * as bcrypt from 'bcrypt';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class VendorService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- helpers ----------
  private isValidPAN(pan: string): boolean {
    return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan);
  }
  private isValidGST(gst: string): boolean {
    return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/.test(
      gst,
    );
  }
  private normalizePAN(pan: string): string {
    return pan.toUpperCase().trim();
  }
  private normalizeGST(gst: string): string {
    return gst.toUpperCase().trim();
  }

  private handleUniqueError(error: any) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      // Prisma sends meta.target like ['email'] or ['GST'] or index name
      const target = (error.meta && (error.meta as any).target) || '';
      const targetStr = Array.isArray(target)
        ? target.join(',').toLowerCase()
        : String(target).toLowerCase();

      if (targetStr.includes('email')) {
        throw new BadRequestException('Email already exists');
      } else if (targetStr.includes('phone')) {
        throw new BadRequestException('Phone number already exists');
      } else if (targetStr.includes('gst')) {
        throw new BadRequestException('GST number already exists');
      } else if (targetStr.includes('pan')) {
        throw new BadRequestException('PAN number already exists');
      } else if (targetStr.includes('representative_email')) {
        throw new BadRequestException('Representative email already exists');
      } else {
        throw new BadRequestException(
          'Duplicate value — one of the fields must be unique',
        );
      }
    }

    // If not a Prisma unique constraint error, just rethrow
    throw error;
  }

  // ---------- create ----------
  async createVendor(dto: CreateVendorDto) {
    try {
      // Basic validations for PAN/GST
      if (!dto.PAN) throw new BadRequestException('PAN is required');
      if (!dto.GST) throw new BadRequestException('GST is required');

      dto.PAN = this.normalizePAN(dto.PAN);
      dto.GST = this.normalizeGST(dto.GST);

      if (!this.isValidPAN(dto.PAN))
        throw new BadRequestException('Invalid PAN Number');
      if (!this.isValidGST(dto.GST))
        throw new BadRequestException('Invalid GST Number.');

      // serviceIds optional: normalize input if present
      const serviceIds: string[] = Array.isArray((dto as any).serviceIds)
        ? (dto as any).serviceIds.filter(Boolean)
        : [];

      // helper to determine verification state
      const isUserVerified = (user) => {
        // ASSUMPTION: waitForOtp === true means NOT verified
        return user && user.waitForOtp === false;
      };

      // Find existing user by email or phone
      const existingUser = await this.prisma.user.findFirst({
        where: { OR: [{ email: dto.email }, { phone: dto.phone }] },
      });

      if (existingUser) {
        if (isUserVerified(existingUser)) {
          // Already exists and verified — do not allow duplicate
          throw new BadRequestException('User already exists and verified');
        }

        // Exists but NOT verified -> update user (overwrite contact details, mark verified)
        console.log(dto.password);

        const passwordHash =
          typeof dto.password === 'string' && dto.password.trim() !== ''
            ? await bcrypt.hash(dto.password, 10)
            : existingUser.password;

        console.log(passwordHash);

        const updatedUser = await this.prisma.user.update({
          where: { id: existingUser.id },
          data: {
            name: dto.name ?? existingUser.name,
            email: dto.email ?? existingUser.email,
            phone: dto.phone ?? existingUser.phone,
            password: passwordHash,
            isActive: dto.isActive ?? true,
            // mark verified: set waitForOtp false, clear otp/rtHash/expiriesIn
            waitForOtp: false,
            otp: null,
            rtHash: null,
            expiriesIn: null,
          },
        });

        // Now create or update vendor and optionally attach services (transaction)
        const vendor = await this.prisma.$transaction(async (tx) => {
          const existingVendor = await tx.vendor.findUnique({
            where: { userId: updatedUser.id },
          });

          const vendorData: any = {
            userId: updatedUser.id,
            comp_name: dto.comp_name ?? null,
            comp_type: dto.comp_type,
            address: dto.address,
            website: dto.website,
            representative: dto.representative,
            representative_email: dto.representative_email,
            representative_phone: dto.representative_phone ?? null,
            GST: dto.GST,
            PAN: dto.PAN,
            isTermsAccepted: dto.isTermsAccepted,
            isActive: dto.isActive ?? true,
          };

          let vendorRecord;
          if (existingVendor) {
            vendorRecord = await tx.vendor.update({
              where: { id: existingVendor.id },
              data: vendorData,
              include: {
                user: { select: { id: true, email: true, phone: true } },
              },
            });
          } else {
            vendorRecord = await tx.vendor.create({
              data: vendorData,
              include: {
                user: { select: { id: true, email: true, phone: true } },
              },
            });
          }

          // Attach services only if serviceIds provided and non-empty
          if (serviceIds && serviceIds.length > 0) {
            const uniqueServiceIds = Array.from(new Set(serviceIds));

            // find existing vendorServices for this vendor (if any) to avoid duplicates
            const existingVendorServices = await tx.vendorService.findMany({
              where: {
                vendorId: vendorRecord.id,
                serviceId: { in: uniqueServiceIds },
              },
            });
            const already = new Set(
              existingVendorServices.map((vs) => vs.serviceId),
            );
            const createData = uniqueServiceIds
              .filter((id) => !already.has(id))
              .map((serviceId) => ({ vendorId: vendorRecord.id, serviceId }));

            if (createData.length > 0) {
              await tx.vendorService.createMany({ data: createData });
            }
          }

          return vendorRecord;
        });

        return vendor;
      }

      // No existing user -> create user + vendor + optional services in a transaction
      const result = await this.prisma.$transaction(async (tx) => {
        const passwordHash = dto.password
          ? await bcrypt.hash(dto.password, 10)
          : '';

        const user = await tx.user.create({
          data: {
            name: dto.name,
            email: dto.email,
            phone: dto.phone,
            password: passwordHash,
            roles: ['VENDOR'], // ensure this matches your enum values
            isActive: true,
            // admin created -> mark verified
            waitForOtp: false,
            otp: null,
            rtHash: null,
            expiriesIn: null,
            profile: null,
          },
        });

        const vendor = await tx.vendor.create({
          data: {
            userId: user.id,
            comp_name: dto.comp_name ?? null,
            comp_type: dto.comp_type,
            address: dto.address,
            website: dto.website,
            representative: dto.representative,
            representative_email: dto.representative_email,
            representative_phone: dto.representative_phone ?? null,
            GST: dto.GST,
            PAN: dto.PAN,
            isTermsAccepted: dto.isTermsAccepted,
          },
          include: { user: { select: { id: true, email: true, phone: true } } },
        });

        // Attach vendor services if provided
        if (serviceIds && serviceIds.length > 0) {
          const uniqueServiceIds = Array.from(new Set(serviceIds));
          const existingVendorServices = await tx.vendorService.findMany({
            where: { vendorId: vendor.id, serviceId: { in: uniqueServiceIds } },
          });
          const already = new Set(
            existingVendorServices.map((vs) => vs.serviceId),
          );
          const createData = uniqueServiceIds
            .filter((id) => !already.has(id))
            .map((serviceId) => ({ vendorId: vendor.id, serviceId }));

          if (createData.length > 0) {
            await tx.vendorService.createMany({ data: createData });
          }
        }

        return { user, vendor };
      });

      // Return vendor (or { user, vendor } if needed)
      return result.vendor ?? result;
    } catch (error: any) {
      // map prisma unique constraint errors -> friendly messages
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.handleUniqueError(error);
      }
      // rethrow http errors
      if (error instanceof HttpException) throw error;

      console.error(error);
      throw new InternalServerErrorException('Internal Server Error');
    }
  }

  // ---------- read -------------
  async getVendorById(id: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id },
      include: {
        user: true,
        documents: true, // VendorDocument[]
        VendorService: true,
        BankDetails: true,
      },
    });

    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  async getVendorByUserId(userId: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          vendor: true,
        },
      });

      if (!user) throw new NotFoundException('User not found');

      return user;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Internal server error');
    }
  }

  async updateVendorProfile(userId: string, dto: VendorProfileDto) {
    try {
      if (!userId) throw new BadRequestException('userId is required');
      if (!dto || Object.keys(dto).length === 0)
        throw new BadRequestException('No fields provided to update');

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      if (!user) throw new NotFoundException('User not found');

      // Build user update payload (only name supported here)
      const userUpdateData: any = {};
      if (dto.name !== undefined && dto.name !== null && dto.name !== '') {
        userUpdateData.name = dto.name;
      }

      // Build vendor update payload only with provided fields
      const vendorUpdateData: any = {};
      if (dto.comp_name !== undefined)
        vendorUpdateData.comp_name = dto.comp_name;
      if (dto.comp_type !== undefined)
        vendorUpdateData.comp_type = dto.comp_type;
      if (dto.address !== undefined) vendorUpdateData.address = dto.address;
      if (dto.website !== undefined) vendorUpdateData.website = dto.website;
      if (dto.representative !== undefined)
        vendorUpdateData.representative = dto.representative;
      if (dto.representative_email !== undefined)
        vendorUpdateData.representative_email = dto.representative_email;
      if (dto.representative_phone !== undefined)
        vendorUpdateData.representative_phone = dto.representative_phone;
      if (dto.GST !== undefined) vendorUpdateData.GST = dto.GST;
      if (dto.PAN !== undefined) vendorUpdateData.PAN = dto.PAN;

      // Nothing to update?
      if (
        Object.keys(userUpdateData).length === 0 &&
        Object.keys(vendorUpdateData).length === 0
      ) {
        throw new BadRequestException('No fields provided to update');
      }

      // Validate PAN/GST formats if provided
      if (
        vendorUpdateData.PAN !== undefined &&
        !this.isValidPAN(vendorUpdateData.PAN)
      ) {
        throw new BadRequestException('Invalid PAN number format.');
      }
      if (
        vendorUpdateData.GST !== undefined &&
        !this.isValidGST(vendorUpdateData.GST)
      ) {
        throw new BadRequestException('Invalid GST number format.');
      }

      const updated = await this.prisma.$transaction(async (tx) => {
        // Ensure vendor profile exists for this user
        const existingVendor = await tx.vendor.findUnique({
          where: { userId },
        });
        if (!existingVendor)
          throw new NotFoundException('Vendor profile not found for this user');

        // Update user if needed
        if (Object.keys(userUpdateData).length > 0) {
          await tx.user.update({
            where: { id: userId },
            data: userUpdateData,
          });
        }

        // Update vendor
        const updatedVendor = await tx.vendor.update({
          where: { userId },
          data: vendorUpdateData,
          include: {
            user: {
              select: { id: true, email: true, phone: true, name: true },
            },
          },
        });

        return updatedVendor;
      });

      return {
        message: 'Vendor profile updated successfully',
        vendor: updated,
      };
    } catch (error: any) {
      // Prisma unique constraint -> friendly message handler
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.handleUniqueError(error);
      }
      if (error instanceof HttpException) throw error;

      console.error(error);
      throw new InternalServerErrorException('Internal server error');
    }
  }

  // ---------- update ----------
  async updateVendor(id: string, dto: Partial<CreateVendorDto>) {
    // fetch existing vendor + linked user
    const existing = await this.prisma.vendor.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!existing) throw new NotFoundException('Vendor not found');

    // Normalize + validate PAN/GST only if provided
    if (typeof dto.PAN === 'string') {
      const pan = this.normalizePAN(dto.PAN);
      if (!this.isValidPAN(pan))
        throw new BadRequestException('Invalid PAN Number');
      dto.PAN = pan;
    }
    if (typeof dto.GST === 'string') {
      const gst = this.normalizeGST(dto.GST);
      if (!this.isValidGST(gst))
        throw new BadRequestException('Invalid GST Number.');
      dto.GST = gst;
    }

    // Build allowed userData: only update these when present
    const allowedUserFields = [
      'name',
      'email',
      'phone',
      'password',
      'isActive',
    ];
    const userData: Record<string, any> = {};
    for (const key of allowedUserFields) {
      if ((dto as any)[key] !== undefined) userData[key] = (dto as any)[key];
    }

    // Hash password if present (use your helper if available)
    if (userData.password) {
      userData.password = await bcrypt.hash(String(userData.password), 10);
    }

    // Build vendorData (same allowed fields as your Vendor model)
    const allowedVendorFields = [
      'comp_name',
      'comp_type',
      'address',
      'website',
      'representative',
      'representative_email',
      'representative_phone',
      'GST',
      'PAN',
      'isTermsAccepted',
    ];
    const vendorData: Record<string, any> = {};
    for (const key of allowedVendorFields) {
      if ((dto as any)[key] !== undefined) vendorData[key] = (dto as any)[key];
    }

    // Handle serviceIds option (it may be undefined — that's allowed)
    const incomingServiceIds: string[] | undefined = Array.isArray(
      (dto as any).serviceIds,
    )
      ? ((dto as any).serviceIds.filter(Boolean).map(String) as string[])
      : undefined;

    // If nothing to update, return fresh vendor
    if (
      Object.keys(userData).length === 0 &&
      Object.keys(vendorData).length === 0 &&
      incomingServiceIds === undefined
    ) {
      return this.prisma.vendor.findUnique({
        where: { id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              isActive: true,
            },
          },
          VendorService: { select: { serviceId: true } },
        },
      });
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        // 1) If updating user fields, check email/phone collision (simple check)
        if (userData.email || userData.phone) {
          const or: any[] = [];
          if (userData.email) or.push({ email: userData.email });
          if (userData.phone) or.push({ phone: userData.phone });

          const conflict = await tx.user.findFirst({
            where: {
              AND: [{ OR: or }, { id: { not: existing.userId } }],
            },
          });

          if (conflict) {
            throw new ConflictException(
              'Email or phone already in use by another account.',
            );
          }
        }

        // 2) Update user if needed
        if (Object.keys(userData).length > 0) {
          await tx.user.update({
            where: { id: existing.userId },
            data: userData,
          });
        }

        // 3) Update vendor if needed
        if (Object.keys(vendorData).length > 0) {
          await tx.vendor.update({
            where: { id },
            data: vendorData,
          });
        }

        // 4) Handle vendor services if incomingServiceIds is provided
        if (incomingServiceIds !== undefined) {
          // normalize & dedupe incoming list
          const uniqueServiceIds: string[] = Array.from(
            new Set(incomingServiceIds),
          );

          // Optional: ensure all serviceIds exist in DroneService (safe guard)
          if (uniqueServiceIds.length > 0) {
            const foundServices = await tx.droneService.findMany({
              where: { id: { in: uniqueServiceIds } },
              select: { id: true },
            });
            const foundIds = new Set<string>(foundServices.map((s) => s.id));
            const missing: string[] = uniqueServiceIds.filter(
              (id) => !foundIds.has(id),
            );
            if (missing.length > 0) {
              throw new BadRequestException(
                `Some serviceIds are invalid: ${missing.join(', ')}`,
              );
            }
          }

          // fetch existing vendorService rows
          const existingVS = await tx.vendorService.findMany({
            where: { vendorId: id },
            select: { id: true, serviceId: true },
          });
          const existingServiceIds = new Set<string>(
            existingVS.map((vs) => String(vs.serviceId)),
          );

          // determine which to add and which to remove
          const toAdd: string[] = uniqueServiceIds.filter(
            (sid) => !existingServiceIds.has(sid),
          );
          const toRemove: string[] = existingVS
            .filter((vs) => !uniqueServiceIds.includes(String(vs.serviceId)))
            .map((vs) => vs.id);

          // delete removed vendorService rows (by id)
          if (toRemove.length > 0) {
            await tx.vendorService.deleteMany({
              where: { id: { in: toRemove } },
            });
          }

          // create new vendorService rows
          if (toAdd.length > 0) {
            const createData: { vendorId: string; serviceId: string }[] =
              toAdd.map((serviceId) => ({ vendorId: id, serviceId }));
            await tx.vendorService.createMany({ data: createData });
          }
        }

        // 5) return updated vendor with user and services
        const fresh = await tx.vendor.findUnique({
          where: { id },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                isActive: true,
              },
            },
            VendorService: { select: { serviceId: true } },
          },
        });

        return fresh;
      });

      return updated;
    } catch (error: any) {
      // Prisma unique constraint -> friendly message
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.handleUniqueError(error);
      }
      if (error instanceof HttpException) throw error;

      console.error(error);
      throw new InternalServerErrorException('Unable to update vendor');
    }
  }

  // ---------- delete ----------
  async deleteVendor(id: string, removeUserToo = true) {
    // 1) ensure vendor exists
    const vendor = await this.prisma.vendor.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');

    try {
      // collect vendor-scoped related ids first (if needed)
      await this.prisma.bidReply.findMany({
        where: { vendorId: id },
        select: { id: true },
      });

      // Build operations in safe order
      const ops: Prisma.PrismaPromise<any>[] = [];

      // 1. If orders reference bidReply (some schemas do), delete those orders first
      // if (bidReplyIds.length) {
      //   ops.push(this.prisma.order.deleteMany({ where: { b: { in: bidReplyIds } } }));
      // }

      // 2. delete bid replies for this vendor
      ops.push(this.prisma.bidReply.deleteMany({ where: { vendorId: id } }));

      // 3. delete orders directly referencing this vendor (if any remain)
      ops.push(this.prisma.order.deleteMany({ where: { vendorId: id } }));

      // 4. delete vendorService rows (child rows)
      ops.push(
        this.prisma.vendorService.deleteMany({ where: { vendorId: id } }),
      );

      // 5. delete vendorDocument rows
      ops.push(
        this.prisma.vendorDocument.deleteMany({ where: { vendorId: id } }),
      );

      // 6. delete bank details for vendor
      ops.push(this.prisma.bankDetails.deleteMany({ where: { vendorId: id } }));

      // 7. finally delete vendor
      ops.push(this.prisma.vendor.delete({ where: { id } }));

      // 8. optionally delete linked user
      if (removeUserToo && vendor.userId) {
        ops.push(this.prisma.user.delete({ where: { id: vendor.userId } }));
      }

      // Execute all operations in a single transaction (atomic)
      await this.prisma.$transaction(ops);

      return { message: 'Vendor and related data deleted successfully' };
    } catch (err) {
      console.error('Failed to delete vendor cascade', err);

      // Helpful error mapping for relation / foreign-key problems
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2014') {
          throw new InternalServerErrorException(
            'Unable to delete vendor because related records still reference child rows. Delete dependent records first or contact support.',
          );
        }
        if (err.code === 'P2003') {
          throw new InternalServerErrorException(
            'Unable to delete vendor due to referenced foreign keys.',
          );
        }
      }

      throw new InternalServerErrorException('Failed to delete vendor');
    }
  }

  // ---------- list ----------
  // @Pagination([
  //   'comp_name',
  //   'address',
  //   'website',
  //   'representative',
  //   'representative_email',
  //   'GST',
  //   'PAN',
  // ])
  // async getAll(
  //   dto: PaginationDto,
  //   modelName: string,
  //   queryOptions: any
  // ): Promise<{ total: number; page: number; limit: number; data: any[] }> {
  //   return { total: 0, page: 0, limit: 0, data: [] };
  // }

  async getAll(dto: PaginationDto) {
    try {
      const page = dto.page ? parseInt(dto.page) : 1;
      const limit = dto.limit ? parseInt(dto.limit) : 10;
      const skip = (page - 1) * limit;

      const where: Prisma.VendorWhereInput = {
        ...(dto.search && {
          OR: [
            // 🔹 User level search
            {
              user: {
                name: {
                  contains: dto.search,
                  mode: 'insensitive',
                },
              },
            },
            {
              user: {
                email: {
                  contains: dto.search,
                  mode: 'insensitive',
                },
              },
            },
            {
              user: {
                phone: {
                  contains: dto.search,
                  mode: 'insensitive',
                },
              },
            },

            // 🔹 Vendor level search
            {
              comp_name: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            {
              representative: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            {
              representative_email: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            {
              representative_phone: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            {
              address: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            {
              website: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            {
              GST: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            {
              PAN: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
          ],
        }),
      };

      const [data, total] = await Promise.all([
        this.prisma.vendor.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            user: true,
            BankDetails: true,
            VendorService: true,
            documents: true,
          },
        }),
        this.prisma.vendor.count({ where }),
      ]);

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

  // ---------- summary ----------
  async summary(id: string, dto: QueryFilterDto) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId: id },
    });
    if (!vendor) throw new NotFoundException('Vendor Not Found');

    const vendorServices = await this.prisma.vendorService.findMany({
      where: { vendorId: vendor.id },
      select: { serviceId: true },
    });
    // A new vendor with zero registered services isn't a 404 — it's just an
    // empty dashboard. Short-circuit with zeroed stats so the page renders.
    if (!vendorServices.length) {
      return {
        totalRevenue: 0,
        totalOrders: 0,
        totalPendingOrders: 0,
        totalCompletedOrders: 0,
        totalBidReq: 0,
        totalOpenBidReq: 0,
        totalClosedBidReq: 0,
        totalAppliedBidReq: 0,
      };
    }

    const currentDate = new Date();
    const selectedMonth = dto?.month
      ? parseInt(dto.month)
      : currentDate.getMonth() + 1;
    const selectedYear = dto?.year
      ? parseInt(dto.year)
      : currentDate.getFullYear();

    const startDate = new Date(selectedYear, selectedMonth - 1, 1);
    const endDate = new Date(selectedYear, selectedMonth, 1);

    const serviceIds = vendorServices.map((vs) => vs.serviceId);

    const [
      totalOrders,
      totalPendingOrders,
      totalCompletedOrders,
      totalRevenueAgg,
      totalBidReq,
      totalOpenBidReq,
      totalClosedBidReq,
      pendingBidReqs,
    ] = await Promise.all([
      this.prisma.order.count({
        where: {
          vendorId: vendor.id,
          createdAt: { gte: startDate, lt: endDate },
        },
      }),
      this.prisma.order.count({
        where: {
          vendorId: vendor.id,
          status: 'PENDING',
          createdAt: { gte: startDate, lt: endDate },
        },
      }),
      this.prisma.order.count({
        where: {
          vendorId: vendor.id,
          status: 'COMPLETED',
          createdAt: { gte: startDate, lt: endDate },
        },
      }),
      this.prisma.order.aggregate({
        where: {
          vendorId: vendor.id,
          createdAt: { gte: startDate, lt: endDate },
        },
        _sum: { vendor_total: true },
      }),
      this.prisma.bidRequest.count({
        where: {
          serviceId: { in: serviceIds },
          createdAt: { gte: startDate, lt: endDate },
        },
      }),
      this.prisma.bidRequest.count({
        where: {
          serviceId: { in: serviceIds },
          status: 'PENDING',
          createdAt: { gte: startDate, lt: endDate },
        },
      }),
      this.prisma.bidRequest.count({
        where: {
          serviceId: { in: serviceIds },
          status: 'AWARDED',
          createdAt: { gte: startDate, lt: endDate },
        },
      }),
      this.prisma.bidRequest.findMany({
        where: {
          serviceId: { in: serviceIds },
          status: 'PENDING',
          createdAt: { gte: startDate, lt: endDate },
        },
        select: { id: true },
      }),
    ]);

    const bidReqIds = pendingBidReqs.map((b) => b.id);

    const totalAppliedBidReq = await this.prisma.bidReply.count({
      where: {
        vendorId: vendor.id,
        bidReqId: { in: bidReqIds },
        createdAt: { gte: startDate, lt: endDate },
      },
    });

    return {
      totalRevenue: totalRevenueAgg._sum.vendor_total ?? 0,
      totalOrders,
      totalPendingOrders,
      totalCompletedOrders,
      totalBidReq,
      totalOpenBidReq,
      totalClosedBidReq,
      totalAppliedBidReq,
    };
  }

  async getMonthlyOrders(dto: QueryFilterDto, userId: string) {
    try {
      const vendor = await this.prisma.vendor.findUnique({
        where: { userId },
        select: {
          id: true,
        },
      });
      if (!vendor) throw new NotFoundException('Vendor Account not found');
      const month = Number(dto.month); // 1–12
      const year = Number(dto.year);

      if (month < 1 || month > 12) {
        throw new BadRequestException('Invalid month');
      }

      // 1️⃣ Build date range for month
      const startDate = new Date(year, month - 1, 1, 0, 0, 0);
      const endDate = new Date(year, month, 0, 23, 59, 59); // last day of month

      // 2️⃣ Fetch orders in this month (ONLY required fields)
      const orders = await this.prisma.order.findMany({
        where: {
          vendorId: vendor?.id,
          // status: 'COMPLETED',
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        select: {
          createdAt: true,
        },
      });

      // 3️⃣ Initialize weekly buckets (max 5 weeks)
      const weeklyOrders = [
        { week: 1, orders: 0 },
        { week: 2, orders: 0 },
        { week: 3, orders: 0 },
        { week: 4, orders: 0 },
        { week: 5, orders: 0 },
      ];

      // 4️⃣ Count orders per week
      for (const order of orders) {
        const dayOfMonth = order.createdAt.getDate();

        let week = 1;
        if (dayOfMonth >= 1 && dayOfMonth <= 7) week = 1;
        else if (dayOfMonth <= 14) week = 2;
        else if (dayOfMonth <= 21) week = 3;
        else if (dayOfMonth <= 28) week = 4;
        else week = 5;

        weeklyOrders[week - 1].orders += 1;
      }

      // 5️⃣ Remove empty week 5 if month has only 4 weeks
      const result = weeklyOrders.filter(
        (w) => !(w.week === 5 && w.orders === 0),
      );

      return result;
    } catch (error) {
      throw error;
    }
  }

  async getMonthlyRevenue(dto: QueryFilterDto, userId: string) {
    try {
      const vendor = await this.prisma.vendor.findUnique({
        where: { userId },
        select: {
          id: true,
        },
      });
      if (!vendor) throw new NotFoundException('Vendor Account not found');

      const month = Number(dto.month); // 1–12
      const year = Number(dto.year);

      if (month < 1 || month > 12) {
        throw new BadRequestException('Invalid month');
      }

      // 1️⃣ Build date range for the month
      const startDate = new Date(year, month - 1, 1, 0, 0, 0);
      const endDate = new Date(year, month, 0, 23, 59, 59);

      // 2️⃣ Fetch orders (only required fields)
      const orders = await this.prisma.order.findMany({
        where: {
          vendorId: vendor.id,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
          status: 'COMPLETED', // 🔥 recommended for revenue
        },
        select: {
          createdAt: true,
          vendor_total: true,
        },
      });

      // 3️⃣ Initialize weekly buckets
      const weeklyRevenue = [
        { week: 1, revenue: 0 },
        { week: 2, revenue: 0 },
        { week: 3, revenue: 0 },
        { week: 4, revenue: 0 },
        { week: 5, revenue: 0 },
      ];

      // 4️⃣ Aggregate revenue per week
      for (const order of orders) {
        const dayOfMonth = order.createdAt.getDate();
        const amount = Number(order.vendor_total ?? 0);

        let week = 1;
        if (dayOfMonth >= 1 && dayOfMonth <= 7) week = 1;
        else if (dayOfMonth <= 14) week = 2;
        else if (dayOfMonth <= 21) week = 3;
        else if (dayOfMonth <= 28) week = 4;
        else week = 5;

        weeklyRevenue[week - 1].revenue += amount;
      }

      // 5️⃣ Round & remove empty week 5 if not needed
      const result = weeklyRevenue
        .map((w) => ({
          week: w.week,
          revenue: Math.round((w.revenue + Number.EPSILON) * 100) / 100,
        }))
        .filter((w) => !(w.week === 5 && w.revenue === 0));

      return result;
    } catch (error) {
      throw error;
    }
  }
}
