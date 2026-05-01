import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { BankService } from './bank.service';
import { CreateBankDetailsDto } from './dtos';
import { GetCurrentUser, Roles } from 'src/common/decorators';
import { UserRole } from '@prisma/client';
import { JwtPayload } from 'src/auth/types/jwtPayload.type';
import { PrismaService } from 'src/prisma/prisma.service';

@ApiTags('Bank Details')
@Controller({
  path: 'bank',
  version: '1',
})
export class BankController {
  constructor(
    private readonly bankDetailsService: BankService,
    private readonly prisma: PrismaService,
  ) {}

  // Previously @Public() — anyone could POST bank details attached to any
  // vendorId or customerId, enabling:
  //   1) vendor/customer ID enumeration (404 vs 409 distinguishes "exists")
  //   2) bank-detail spoofing: attach attacker's account to a victim who
  //      hasn't set up banking yet, then the 409 on the victim's own
  //      attempt makes them believe it was already configured.
  // Now requires auth + the authenticated caller must own the vendor or
  // customer record being modified (or be an admin).
  @Post()
  @Roles(UserRole.ADMIN, UserRole.VENDOR, UserRole.CUSTOMER)
  @ApiOperation({
    summary: 'Add bank details for the current vendor/customer (or via admin)',
  })
  @ApiResponse({ status: 201, description: 'Bank details added successfully' })
  @ApiResponse({ status: 403, description: 'Not your vendor/customer record' })
  @ApiResponse({ status: 404, description: 'Vendor/Customer not found' })
  @ApiResponse({ status: 409, description: 'Bank details already exist' })
  async createBankDetails(
    @Body() dto: CreateBankDetailsDto,
    @GetCurrentUser() caller: JwtPayload,
  ) {
    const isAdmin = caller.role?.includes(UserRole.ADMIN);

    if (!isAdmin) {
      if (dto.vendorId) {
        const vendor = await this.prisma.vendor.findUnique({
          where: { id: dto.vendorId },
          select: { userId: true },
        });
        if (!vendor) throw new NotFoundException('Vendor not found');
        if (vendor.userId !== caller.sub) {
          throw new ForbiddenException(
            'You can only add bank details to your own vendor record',
          );
        }
      }
      if (dto.customerId) {
        const customer = await this.prisma.customer.findUnique({
          where: { id: dto.customerId },
          select: { userId: true },
        });
        if (!customer) throw new NotFoundException('Customer not found');
        if (customer.userId !== caller.sub) {
          throw new ForbiddenException(
            'You can only add bank details to your own customer record',
          );
        }
      }
    }

    return this.bankDetailsService.createBankDetails(dto);
  }

  // Vendor routes
  @Get('vendor/:userId')
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @ApiOperation({ summary: 'Get bank details by vendor ID' })
  @ApiResponse({
    status: 200,
    description: 'Bank details retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Bank details not found' })
  async getBankDetailsByVendor(@Param('userId') userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        vendor: {
          select: {
            id: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.vendor) throw new NotFoundException('Vendor not found');
    const vendorId = user.vendor.id;
    return this.bankDetailsService.getBankDetailsByVendor(vendorId);
  }

  @Patch('vendor/:userId')
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @ApiOperation({ summary: 'Update bank record by vendor ID' })
  @ApiResponse({ status: 200, description: 'Bank updated successfully' })
  async updateBankByVendor(
    @Param('userId') userId: string,
    @Body() dto: Partial<CreateBankDetailsDto>,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        vendor: {
          select: {
            id: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.vendor) throw new NotFoundException('Vendor not found');
    const vendorId = user.vendor.id;
    return await this.bankDetailsService.updateBankByVendor(vendorId, dto);
  }

  @Delete('vendor/:vendorId')
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @ApiOperation({ summary: 'Delete bank record by vendor ID' })
  @ApiResponse({ status: 200, description: 'Bank deleted successfully' })
  deleteBankByVendor(@Param('vendorId') vendorId: string) {
    return this.bankDetailsService.deleteBankByVendor(vendorId);
  }

  // Customer routes
  @Get('customer/:userId')
  @Roles(UserRole.ADMIN, UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Get bank details by customer ID' })
  @ApiResponse({
    status: 200,
    description: 'Bank details retrieved successfully',
  })
  @ApiResponse({ status: 404, description: 'Bank details not found' })
  async getBankDetailsByCustomer(@Param('userId') userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        customer: {
          select: {
            id: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.customer) throw new NotFoundException('Customer not found');
    const customerId = user.customer.id;
    return await this.bankDetailsService.getBankDetailsByCustomer(customerId);
  }

  @Patch('customer/:userId')
  @Roles(UserRole.ADMIN, UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Update bank record by customer ID' })
  @ApiResponse({ status: 200, description: 'Bank updated successfully' })
  async updateBankByCustomer(
    @Param('userId') userId: string,
    @Body() dto: Partial<CreateBankDetailsDto>,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        customer: {
          select: {
            id: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.customer) throw new NotFoundException('Customer not found');
    const customerId = user.customer.id;
    return await this.bankDetailsService.updateBankByCustomer(customerId, dto);
  }

  @Delete('customer/:customerId')
  @Roles(UserRole.ADMIN, UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Delete bank record by customer ID' })
  @ApiResponse({ status: 200, description: 'Bank deleted successfully' })
  deleteBankByCustomer(@Param('customerId') customerId: string) {
    return this.bankDetailsService.deleteBankByCustomer(customerId);
  }
}
