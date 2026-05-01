import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Query,
  Patch,
  NotFoundException,
} from '@nestjs/common';
import { VendorServiceService } from './vendor-service.service';
import { AddServicesToVendorDto } from './dto/vendor-services.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Public, Roles } from 'src/common/decorators';
import { UserRole } from '@prisma/client';
import { PaginationDto } from 'src/common/dto';
import { PrismaService } from 'src/prisma/prisma.service';

@ApiTags('VendorService')
@ApiBearerAuth()
@Controller({
  path: 'vendor-service',
  version: '1',
})
export class VendorServiceController {
  constructor(
    private readonly vendorService: VendorServiceService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post(':id')
  @ApiOperation({ summary: 'Add new Service' })
  @ApiResponse({ status: 201, description: 'Services Added successfully' })
  @ApiResponse({ status: 409, description: 'Vendor Not Found' })
  createVendor(@Param('id') id: string, @Body() dto: AddServicesToVendorDto) {
    return this.vendorService.addServicesToVendor(id, dto.serviceIds);
  }

  @Get(':userId')
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @ApiOperation({ summary: 'Get all vendors' })
  @ApiResponse({ status: 200, description: 'Vendors retrieved successfully' })
  async getAll(@Param('userId') userId: string, @Query() dto: PaginationDto) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found');
    }

    return await this.vendorService.getAll(dto, 'vendorService', {
      where: { vendorId: vendor.id },
      include: {
        service: true,
        vendor: true,
      },
    });
  }

  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @Patch(':id')
  @ApiOperation({ summary: 'Update Vendor Services' })
  @ApiResponse({
    status: 200,
    description: 'Vendors Service Updated successfully',
  })
  async updateServices(
    @Param('id') vendorId: string,
    @Body() body: { serviceIds: string[] },
  ) {
    return this.vendorService.updateVendorServices(vendorId, body.serviceIds);
  }
}
