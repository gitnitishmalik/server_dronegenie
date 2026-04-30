import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCustomerDto, QueryFilterDto, UpdateCustomerProfileDto } from './dtos';
import * as bcrypt from 'bcrypt';
import { Pagination } from 'src/common/decorators/pagination.decorator';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import { Prisma } from '@prisma/client';
import { use } from 'passport';
import { OrderStatus } from 'src/common/enums';

@Injectable()
export class CustomerService {
  constructor(private readonly prisma: PrismaService) { }

  // ---------- helpers ----------
  private isValidPAN(pan: string): boolean {
    return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan);
  }
  private isValidGST(gst: string): boolean {
    return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gst);
  }
  private normalizePAN(pan: string): string {
    return pan.toUpperCase().trim();
  }
  private normalizeGST(gst: string): string {
    return gst.toUpperCase().trim();
  }

  private handleUniqueError(error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // Prisma sends meta.target like ['email'] or ['GST'] or index name
      const target = (error.meta && (error.meta as any).target) || '';
      const targetStr = Array.isArray(target) ? target.join(',').toLowerCase() : String(target).toLowerCase();

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
        throw new BadRequestException('Duplicate value — one of the fields must be unique');
      }
    }

    // If not a Prisma unique constraint error, just rethrow
    throw error;
  }

  // ---------- create ----------
  async createCustomer(dto: CreateCustomerDto & { userId?: string }) {
    try {
      // Basic DTO validation (class-validator should already run, but double-check)
      if (!dto) throw new BadRequestException('Payload is required');

      // Normalize + validate PAN/GST
      if (!dto.PAN) throw new BadRequestException('PAN is required');
      if (!dto.GST) throw new BadRequestException('GST is required');

      dto.PAN = this.normalizePAN(dto.PAN);
      dto.GST = this.normalizeGST(dto.GST);

      if (!this.isValidPAN(dto.PAN)) throw new BadRequestException('Invalid PAN Number');
      if (!this.isValidGST(dto.GST)) throw new BadRequestException('Invalid GST Number.');

      // Prepare values used inside transaction
      const wantsToAttachToUser = Boolean(dto.userId && dto.userId.trim().length > 0);

      const result = await this.prisma.$transaction(async (tx) => {
        let userId: string;

        if (wantsToAttachToUser) {
          // 1) Attach to an existing user
          const user = await tx.user.findUnique({ where: { id: dto.userId } });
          if (!user) throw new NotFoundException('User not found');

          // Prevent creating a customer if the user already has a customer profile
          const existingCustomer = await tx.customer.findUnique({ where: { userId: user.id } });
          if (existingCustomer) throw new ConflictException('This user already has a customer profile.');

          // Update role to CUSTOMER (if needed)
          await tx.user.update({ where: { id: user.id }, data: { roles: { set: ['CUSTOMER'] } } });

          userId = user.id;
        } else {
          // 2) Create a fresh user and attach the customer to it
          // Validate required user fields are present in DTO
          if (!dto.name || !dto.email || !dto.phone || !dto.password) {
            throw new BadRequestException('name, email, phone and password are required when creating a new user');
          }

          // Hash password
          const hashedPassword = dto.password ? await bcrypt.hash(dto.password, 10) : '';

          // Create user (fail if unique constraints violated)
          const createdUser = await tx.user.create({
            data: {
              name: dto.name,
              email: dto.email,
              phone: dto.phone,
              roles: ['CUSTOMER'],
              profile: null,
              password: hashedPassword,
              isActive: dto.isActive ?? false,
              otp: null,
              expiriesIn: null,
              waitForOtp: false, // admin-created user — consider marking verified or send OTP as needed
              rtHash: '',
            },
          });

          userId = createdUser.id;
        }

        // Now create the customer record
        const customerCreateData: any = {
          userId,
          comp_name: dto.comp_name ?? null,
          comp_type: dto.comp_type,
          address: dto.address,
          website: dto.website,
          representative: dto.representative,
          representative_email: dto.representative_email,
          representative_phone: dto.representative_phone ?? null,
          GST: dto.GST,
          PAN: dto.PAN,
          isTermsAccepted: dto.isTermsAccepted ?? true,
        };

        const createdCustomer = await tx.customer.create({
          data: customerCreateData,
          include: {
            user: { select: { id: true, email: true, phone: true, name: true } },
          },
        });

        return createdCustomer;
      });

      return result;
    } catch (error: any) {
      // Prisma unique constraint -> user-friendly messages using your handler
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // If handleUniqueError supports a mapping param you showed earlier, you can call it accordingly.
        // I will call the handler you provided (which checks meta.target) so it throws friendly errors.
        this.handleUniqueError(error);
      }

      if (error instanceof HttpException) throw error;
      console.error(error);
      throw new InternalServerErrorException('Unable to create customer');
    }
  }


  // ---------- read ----------
  async getCustomerById(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, email: true, phone: true, isActive: true } },
        BankDetails: {
          select: {
            paymentMethod: true,
            accountHolderName: true,
            accountNumber: true,
            bankAddress: true,
            ifscCode: true,
            swiftIbanCode: true,
          },
        },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }


  async getCustomerByUserId(userId: string) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          customer: true
        }
      })

      if (!user) throw new NotFoundException("User not found");

      return user;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.log(error);

      throw new InternalServerErrorException("Internal server error")
    }
  }


  async profileUpdateCustomer(userId: string, dto: UpdateCustomerProfileDto) {
    try {
      // Basic guard
      if (!userId) throw new BadRequestException('userId is required');
      const user = await this.prisma.user.findUnique({
        where: { id: userId }
      })
      if (!user) throw new NotFoundException("User not found")

      // Build user update payload only with provided fields
      const userUpdateData: any = {};
      if (dto.name !== undefined) userUpdateData.name = dto.name;

      // Build customer update payload only with provided fields
      const customerUpdateData: any = {};
      if (dto.comp_name !== undefined) customerUpdateData.comp_name = dto.comp_name;
      if (dto.comp_type !== undefined) customerUpdateData.comp_type = dto.comp_type;
      if (dto.address !== undefined) customerUpdateData.address = dto.address;
      if (dto.website !== undefined) customerUpdateData.website = dto.website;
      if (dto.representative !== undefined) customerUpdateData.representative = dto.representative;
      if (dto.representative_email !== undefined) customerUpdateData.representative_email = dto.representative_email;
      if (dto.representative_phone !== undefined) customerUpdateData.representative_phone = dto.representative_phone;
      if (dto.GST !== undefined) customerUpdateData.GST = dto.GST;
      if (dto.PAN !== undefined) customerUpdateData.PAN = dto.PAN;

      // Nothing to update?
      if (Object.keys(userUpdateData).length === 0 && Object.keys(customerUpdateData).length === 0) {
        throw new BadRequestException('No fields provided to update');
      }

      const updated = await this.prisma.$transaction(async (tx) => {
        // Ensure customer profile exists
        const customer = await tx.customer.findUnique({ where: { userId } });
        if (!customer) throw new NotFoundException('Customer profile not found for this user');

        // Update user if needed
        if (Object.keys(userUpdateData).length > 0) {
          await tx.user.update({
            where: { id: userId },
            data: userUpdateData,
          });
        }

        // Update customer if needed
        let updatedCustomer = customer;
        if (Object.keys(customerUpdateData).length > 0) {
          updatedCustomer = await tx.customer.update({
            where: { userId },
            data: customerUpdateData,
            include: { user: { select: { id: true, email: true, phone: true, name: true } } },
          });
        } else {
          // include user selection to return consistent shape
          updatedCustomer = await tx.customer.findUnique({
            where: { userId },
            include: { user: { select: { id: true, email: true, phone: true, name: true } } },
          }) as any;
        }

        return updatedCustomer;
      });

      return { message: 'Profile updated successfully', customer: updated };
    } catch (error: any) {
      // convert Prisma unique constraint into friendly messages
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.handleUniqueError(error);
      }

      if (error instanceof HttpException) throw error;
      console.error(error);
      throw new InternalServerErrorException('Internal server error');
    }
  }


  // ---------- update ----------
  async updateCustomer(id: string, dto: Partial<CreateCustomerDto>) {
    // Ensure id provided
    if (!id) throw new BadRequestException('Customer id is required');

    // Load existing customer + linked user
    const existing = await this.prisma.customer.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!existing) throw new NotFoundException('Customer not found');

    // Build customer update payload (only allowed fields)
    const customerUpdate: any = {};
    if (dto.comp_name !== undefined) customerUpdate.comp_name = dto.comp_name;
    if (dto.comp_type !== undefined) customerUpdate.comp_type = dto.comp_type;
    if (dto.address !== undefined) customerUpdate.address = dto.address;
    if (dto.website !== undefined) customerUpdate.website = dto.website;
    if (dto.representative !== undefined) customerUpdate.representative = dto.representative;
    if (dto.representative_email !== undefined) customerUpdate.representative_email = dto.representative_email;
    if (dto.representative_phone !== undefined) customerUpdate.representative_phone = dto.representative_phone;

    // Normalize + validate PAN/GST only if provided
    if (typeof dto.PAN === 'string') {
      const pan = this.normalizePAN(dto.PAN);
      if (!this.isValidPAN(pan)) throw new BadRequestException('Invalid PAN number format');
      customerUpdate.PAN = pan;
    }

    if (typeof dto.GST === 'string') {
      const gst = this.normalizeGST(dto.GST);
      if (!this.isValidGST(gst)) throw new BadRequestException('Invalid GST number format');
      customerUpdate.GST = gst;
    }

    // isTermsAccepted and isActive can be updated if present
    if (typeof (dto as any).isTermsAccepted === 'boolean') {
      customerUpdate.isTermsAccepted = (dto as any).isTermsAccepted;
    }


    // Build user update payload (if admin provided user-related fields)
    const userUpdate: any = {};
    if (dto.name !== undefined) userUpdate.name = dto.name;
    if (dto.email !== undefined) userUpdate.email = dto.email;
    if (dto.phone !== undefined) userUpdate.phone = dto.phone;
    if (dto.password !== undefined && dto.password !== null && dto.password !== '') {
      // hash the password
      userUpdate.password = dto.password ? await bcrypt.hash(dto.password, 10) : '';
    }
    if (typeof (dto as any).isActive === 'boolean') {
      userUpdate.isActive = (dto as any).isActive;
    }


    // Prevent user re-link via this method (optional safety)
    if ((dto as any).userId && (dto as any).userId !== existing.userId) {
      throw new ForbiddenException('Changing user link is not allowed here.');
    }

    // If nothing to update at all -> error
    if (Object.keys(customerUpdate).length === 0 && Object.keys(userUpdate).length === 0) {
      throw new BadRequestException('No valid fields provided to update');
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const userId = existing.userId;

        // If email/phone provided, check for collisions with other users
        if (userUpdate.email || userUpdate.phone) {
          const or: any[] = [];
          if (userUpdate.email) or.push({ email: userUpdate.email });
          if (userUpdate.phone) or.push({ phone: userUpdate.phone });

          const conflictUser = await tx.user.findFirst({
            where: {
              AND: [
                { OR: or },
                { id: { not: userId } }, // exclude the current linked user
              ],
            },
          });

          if (conflictUser) {
            // If a conflicting user exists, throw a friendly conflict
            // You might want to check conflictUser.waitForOtp to allow special handling; we keep it simple
            throw new ConflictException('Email or phone already in use by another account.');
          }
        }

        // Perform updates in deterministic order: update user first, then customer
        if (Object.keys(userUpdate).length > 0) {
          await tx.user.update({
            where: { id: userId },
            data: userUpdate,
          });
        }

        let updatedCustomer = {} as any;
        if (Object.keys(customerUpdate).length > 0) {
          updatedCustomer = await tx.customer.update({
            where: { id },
            data: customerUpdate,
            include: { user: { select: { id: true, email: true, phone: true, name: true } } },
          });
        } else {
          // still include user info for consistent return shape
          updatedCustomer = await tx.customer.findUnique({
            where: { id },
            include: { user: { select: { id: true, email: true, phone: true, name: true } } },
          }) as any;
        }

        return updatedCustomer;
      });

      return { message: 'Customer updated successfully', customer: updated };
    } catch (error: any) {
      // Translate prisma unique constraint errors to friendly messages
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.handleUniqueError(error);
      }

      if (error instanceof HttpException) throw error;
      console.error(error);
      throw new InternalServerErrorException('Unable to update customer');
    }
  }



  // ---------- delete ----------
  async deleteCustomer(id: string, removeUserToo = true) {
    // 1. ensure customer exists
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    // 2. get bid request ids for this customer
    const bidRequests = await this.prisma.bidRequest.findMany({
      where: { customerId: id },
      select: { id: true },
    });
    const bidReqIds = bidRequests.map((b) => b.id);

    // 3. build operations in the safe deletion order
    const ops: Prisma.PrismaPromise<any>[] = [];

    // A: If there are bid requests, first remove Orders that reference those bid requests
    if (bidReqIds.length) {
      // delete orders that reference these bid requests (critical to avoid P2014)
      ops.push(this.prisma.order.deleteMany({ where: { bidReqId: { in: bidReqIds } } }));

      // delete any bid replies for these bid requests
      ops.push(this.prisma.bidReply.deleteMany({ where: { bidReqId: { in: bidReqIds } } }));

      // now safe to delete the bid requests themselves
      ops.push(this.prisma.bidRequest.deleteMany({ where: { id: { in: bidReqIds } } }));
    }

    // B: delete orders directly owned by this customer (if any remain)
    ops.push(this.prisma.order.deleteMany({ where: { customerId: id } }));

    // C: other child tables
    ops.push(this.prisma.bankDetails.deleteMany({ where: { customerId: id } }));

    // D: finally delete the customer record
    ops.push(this.prisma.customer.delete({ where: { id } }));

    // E: optionally delete the linked user (if asked)
    if (removeUserToo && customer.userId) {
      ops.push(this.prisma.user.delete({ where: { id: customer.userId } }));
    }

    // 4. run transaction
    try {
      await this.prisma.$transaction(ops);
      return { message: 'Customer and related data deleted successfully' };
    } catch (err) {
      console.error('Failed to delete customer cascade', err);
      // If it's a Prisma relation error, bubble a clear message (optional)
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2014') {
        throw new InternalServerErrorException(
          'Unable to delete customer due to dependent records. Please delete related orders first or contact support.'
        );
      }
      throw new InternalServerErrorException('Failed to delete customer');
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
  //   queryOptions: any,
  // ): Promise<{ total: number; page: number; limit: number; data: any[] }> {
  //   // Intercepted by Pagination decorator
  //   return { total: 0, page: 0, limit: 0, data: [] };
  // }

  async getAll(dto: PaginationDto) {
    try {
      const page = dto.page ? parseInt(dto.page) : 1;
      const limit = dto.limit ? parseInt(dto.limit) : 10;
      const skip = (page - 1) * limit;

      const where: Prisma.CustomerWhereInput = {
        ...(dto.search && {
          OR: [
            // 🔹 User-level search
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

            // 🔹 Customer-level search
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
        this.prisma.customer.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            user: true,
            BankDetails: true,
          }
        }),
        this.prisma.customer.count({ where }),
      ]);

      return {
        data,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw error;
    }
  }



  // ---------- summary ----------
  async summary(id: string, dto: QueryFilterDto) {
    const customer = await this.prisma.customer.findUnique({ where: { userId: id } });
    if (!customer) throw new NotFoundException('Customer Not Found');

    const currentDate = new Date();
    const selectedMonth = dto?.month ? parseInt(dto.month) : currentDate.getMonth() + 1;
    const selectedYear = dto?.year ? parseInt(dto.year) : currentDate.getFullYear();

    const startDate = new Date(selectedYear, selectedMonth - 1, 1);
    const endDate = new Date(selectedYear, selectedMonth, 1);

    const [totalOrders, totalBidReq, totalOpenBidReq, totalClosedBidReq, totalSpends] = await Promise.all([
      this.prisma.order.count({
        where: { customerId: customer.id, createdAt: { gte: startDate, lt: endDate } },
      }),
      this.prisma.bidRequest.count({
        where: { customerId: customer.id, createdAt: { gte: startDate, lt: endDate } },
      }),
      this.prisma.bidRequest.count({
        where: {
          customerId: customer.id,
          status: 'PENDING',
          createdAt: { gte: startDate, lt: endDate },
        },
      }),
      this.prisma.bidRequest.count({
        where: {
          customerId: customer.id,
          status: 'AWARDED',
          createdAt: { gte: startDate, lt: endDate },
        },
      }),
      this.prisma.order.aggregate({
        where: { status: OrderStatus.COMPLETED },
        _sum: { customer_total: true }
      })
    ]);

    return { totalOrders, totalBidReq, totalOpenBidReq, totalClosedBidReq, totalSpends: totalSpends._sum.customer_total };
  }
}
