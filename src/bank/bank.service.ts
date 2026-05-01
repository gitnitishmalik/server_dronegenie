import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
  HttpException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateBankDetailsDto } from './dtos/bank-details.dto';
import { PaymentMethod } from '@prisma/client';

@Injectable()
export class BankService {
  constructor(private readonly prisma: PrismaService) {}

  async createBankDetails(dto: CreateBankDetailsDto) {
    try {
      // Validate that either vendorId or customerId is provided (but not both)
      if (!dto.vendorId && !dto.customerId) {
        throw new BadRequestException(
          'Either vendorId or customerId is required',
        );
      }

      if (dto.vendorId && dto.customerId) {
        throw new BadRequestException(
          'Cannot provide both vendorId and customerId',
        );
      }

      // Check for vendor bank details
      if (dto.vendorId) {
        // Verify vendor exists
        const vendor = await this.prisma.vendor.findUnique({
          where: { id: dto.vendorId },
        });

        if (!vendor) {
          throw new NotFoundException('Vendor not found');
        }

        // Check if bank details already exist for this vendor
        const existingVendorBank = await this.prisma.bankDetails.findFirst({
          where: { vendorId: dto.vendorId },
        });

        if (existingVendorBank) {
          throw new ConflictException(
            'Bank details already exist for this vendor',
          );
        }
      }

      // Check for customer bank details
      if (dto.customerId) {
        // Verify customer exists
        const customer = await this.prisma.customer.findUnique({
          where: { id: dto.customerId },
        });

        if (!customer) {
          throw new NotFoundException('Customer not found');
        }

        // Check if bank details already exist for this customer
        const existingCustomerBank = await this.prisma.bankDetails.findFirst({
          where: { customerId: dto.customerId },
        });

        if (existingCustomerBank) {
          throw new ConflictException(
            'Bank details already exist for this customer',
          );
        }
      }

      // Create new bank details if all validations pass
      return await this.prisma.bankDetails.create({
        data: dto,
        include: {
          vendor: true,
          customer: true,
        },
      });
    } catch (error) {
      // Re-throw known errors
      if (
        error instanceof ConflictException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      // Handle unexpected errors
      console.error('Unexpected error creating bank details:', error);
      throw new InternalServerErrorException('Failed to create bank details');
    }
  }

  async getBankDetailsByVendor(vendorId: string) {
    const bankDetails = await this.prisma.bankDetails.findFirst({
      where: { vendorId },
    });
    if (!bankDetails) throw new NotFoundException('Bank details not found');
    return bankDetails;
  }

  async getBankDetailsByCustomer(customerId: string) {
    const bankDetails = await this.prisma.bankDetails.findFirst({
      where: { customerId },
    });
    if (!bankDetails) throw new NotFoundException('Bank details not found');
    return bankDetails;
  }

  async updateBankByVendor(
    vendorId: string,
    dto: Partial<CreateBankDetailsDto>,
  ) {
    try {
      if (!vendorId) throw new BadRequestException('vendorId is required');
      if (!dto || Object.keys(dto).length === 0)
        throw new BadRequestException('No bank data provided');

      // paymentMethod must be provided
      if (dto.paymentMethod === undefined || dto.paymentMethod === null) {
        throw new BadRequestException('paymentMethod is required');
      }

      const paymentMethod = dto.paymentMethod as PaymentMethod;
      const dataPayload: any = { vendorId, paymentMethod };

      if (paymentMethod === PaymentMethod.NETBANKING) {
        // Validate required netbanking fields
        if (!dto.accountHolderName)
          throw new BadRequestException(
            'accountHolderName is required for netbanking',
          );
        if (!dto.accountNumber)
          throw new BadRequestException(
            'accountNumber is required for netbanking',
          );
        if (!dto.ifscCode)
          throw new BadRequestException('ifscCode is required for netbanking');

        dataPayload.accountHolderName = dto.accountHolderName;
        dataPayload.accountNumber = dto.accountNumber;
        dataPayload.bankAddress = dto.bankAddress ?? null;
        dataPayload.ifscCode = dto.ifscCode;
        dataPayload.swiftIbanCode = dto.swiftIbanCode ?? null;

        // Clear credit card fields
        dataPayload.cardHolderName = null;
        dataPayload.cardNumber = null;
        dataPayload.cardExpiry = null;
        dataPayload.cardCvv = null;
      } else if (paymentMethod === PaymentMethod.CREDIT_CARD) {
        // Validate required card fields
        if (!dto.cardHolderName)
          throw new BadRequestException(
            'cardHolderName is required for credit card',
          );
        if (!dto.cardNumber)
          throw new BadRequestException(
            'cardNumber is required for credit card',
          );
        if (!dto.cardExpiry)
          throw new BadRequestException(
            'cardExpiry is required for credit card',
          );
        if (!dto.cardCvv)
          throw new BadRequestException('cardCvv is required for credit card');

        dataPayload.cardHolderName = dto.cardHolderName;
        dataPayload.cardNumber = dto.cardNumber;
        dataPayload.cardExpiry = dto.cardExpiry;
        dataPayload.cardCvv = dto.cardCvv;

        // Clear netbanking fields
        dataPayload.accountHolderName = null;
        dataPayload.accountNumber = null;
        dataPayload.bankAddress = null;
        dataPayload.ifscCode = null;
        dataPayload.swiftIbanCode = null;
      } else {
        throw new BadRequestException('Unsupported payment method');
      }

      const result = await this.prisma.$transaction(async (tx) => {
        // Fetch existing bank details for vendor (oldest first)
        const existing = await tx.bankDetails.findMany({
          where: { vendorId },
          orderBy: { createdAt: 'asc' },
        });

        // No existing -> create
        if (existing.length === 0) {
          const created = await tx.bankDetails.create({
            data: dataPayload,
          });

          // Post-create dedupe if concurrent creates occurred
          const after = await tx.bankDetails.findMany({
            where: { vendorId },
            orderBy: { createdAt: 'asc' },
          });
          if (after.length > 1) {
            const keep = after[after.length - 1];
            const toDelete = after.slice(0, after.length - 1).map((r) => r.id);
            await tx.bankDetails.deleteMany({
              where: { id: { in: toDelete } },
            });
            return keep;
          }

          return created;
        }

        // One or more exist -> update the most recent (keep last)
        const keep = existing[existing.length - 1];

        const updated = await tx.bankDetails.update({
          where: { id: keep.id },
          data: dataPayload,
        });

        // Delete older duplicates (if any)
        if (existing.length > 1) {
          const toDelete = existing
            .slice(0, existing.length - 1)
            .map((r) => r.id);
          await tx.bankDetails.deleteMany({ where: { id: { in: toDelete } } });
        }

        return updated;
      });

      return result;
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      console.error(error);
      throw new InternalServerErrorException('Internal server error');
    }
  }

  async updateBankByCustomer(
    customerId: string,
    dto: Partial<CreateBankDetailsDto>,
  ) {
    try {
      if (!customerId) throw new BadRequestException('customerId is required');
      if (!dto || Object.keys(dto).length === 0)
        throw new BadRequestException('No bank data provided');

      // paymentMethod must be provided
      if (dto.paymentMethod === undefined || dto.paymentMethod === null) {
        throw new BadRequestException('paymentMethod is required');
      }

      // Build payload depending on selected payment method.
      // We explicitly set non-relevant fields to null so only one "type" of details is stored.
      // Use a plain object typed as any to satisfy Prisma typings after validation.
      const paymentMethod = dto.paymentMethod as PaymentMethod;
      const dataPayload: any = { customerId, paymentMethod };

      if (paymentMethod === PaymentMethod.NETBANKING) {
        // Validate required netbanking fields (basic checks)
        if (!dto.accountHolderName)
          throw new BadRequestException(
            'accountHolderName is required for netbanking',
          );
        if (!dto.accountNumber)
          throw new BadRequestException(
            'accountNumber is required for netbanking',
          );
        if (!dto.ifscCode)
          throw new BadRequestException('ifscCode is required for netbanking');

        dataPayload.accountHolderName = dto.accountHolderName;
        dataPayload.accountNumber = dto.accountNumber;
        dataPayload.bankAddress = dto.bankAddress ?? null;
        dataPayload.ifscCode = dto.ifscCode;
        dataPayload.swiftIbanCode = dto.swiftIbanCode ?? null;

        // Clear credit card fields
        dataPayload.cardHolderName = null;
        dataPayload.cardNumber = null;
        dataPayload.cardExpiry = null;
        dataPayload.cardCvv = null;
      } else if (paymentMethod === PaymentMethod.CREDIT_CARD) {
        // Validate required card fields (basic checks)
        if (!dto.cardHolderName)
          throw new BadRequestException(
            'cardHolderName is required for credit card',
          );
        if (!dto.cardNumber)
          throw new BadRequestException(
            'cardNumber is required for credit card',
          );
        if (!dto.cardExpiry)
          throw new BadRequestException(
            'cardExpiry is required for credit card',
          );
        if (!dto.cardCvv)
          throw new BadRequestException('cardCvv is required for credit card');

        dataPayload.cardHolderName = dto.cardHolderName;
        dataPayload.cardNumber = dto.cardNumber;
        dataPayload.cardExpiry = dto.cardExpiry;
        dataPayload.cardCvv = dto.cardCvv;

        // Clear netbanking fields
        dataPayload.accountHolderName = null;
        dataPayload.accountNumber = null;
        dataPayload.bankAddress = null;
        dataPayload.ifscCode = null;
        dataPayload.swiftIbanCode = null;
      } else {
        // If you have more payment methods, handle them here; else throw
        throw new BadRequestException('Unsupported payment method');
      }

      // Optional: allow vendorId in payload if present in DTO
      if (dto.vendorId !== undefined) dataPayload.vendorId = dto.vendorId;

      const result = await this.prisma.$transaction(async (tx) => {
        // Fetch existing bank details for the customer (ordered by createdAt)
        const existing = await tx.bankDetails.findMany({
          where: { customerId },
          orderBy: { createdAt: 'asc' }, // oldest first
        });

        // No existing -> create
        if (existing.length === 0) {
          const created = await tx.bankDetails.create({
            data: dataPayload,
          });

          // Post-create dedupe: if a concurrent race left duplicates, remove older ones and keep latest
          const after = await tx.bankDetails.findMany({
            where: { customerId },
            orderBy: { createdAt: 'asc' },
          });
          if (after.length > 1) {
            const keep = after[after.length - 1];
            const toDelete = after.slice(0, after.length - 1).map((r) => r.id);
            await tx.bankDetails.deleteMany({
              where: { id: { in: toDelete } },
            });
            return keep;
          }

          return created;
        }

        // One or more exist -> update the most recently created (keep last)
        const keep = existing[existing.length - 1];

        const updated = await tx.bankDetails.update({
          where: { id: keep.id },
          data: dataPayload,
        });

        // Delete older duplicates (if any)
        if (existing.length > 1) {
          const toDelete = existing
            .slice(0, existing.length - 1)
            .map((r) => r.id);
          await tx.bankDetails.deleteMany({ where: { id: { in: toDelete } } });
        }

        return updated;
      });

      return result;
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      console.error(error);
      throw new InternalServerErrorException('Internal server error');
    }
  }

  async deleteBankByVendor(vendorId: string) {
    const bank = await this.prisma.bankDetails.findFirst({
      where: { vendorId },
    });
    if (!bank) throw new NotFoundException('Bank record not found');

    return this.prisma.bankDetails.deleteMany({ where: { vendorId } });
  }

  async deleteBankByCustomer(customerId: string) {
    const bank = await this.prisma.bankDetails.findFirst({
      where: { customerId },
    });
    if (!bank) throw new NotFoundException('Bank record not found');

    return this.prisma.bankDetails.deleteMany({ where: { customerId } });
  }
}
