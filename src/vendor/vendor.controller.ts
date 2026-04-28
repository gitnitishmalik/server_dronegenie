import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { VendorService } from './vendor.service';
import { CreateVendorDto, QueryFilterDto, VendorProfileDto } from './dtos';
import { GetCurrentUserId, Public, Roles } from 'src/common/decorators';
import { UserRole } from '@prisma/client';
import { PaginationDto } from 'src/common/dto/pagination.dto';


@ApiTags('Vendors')
@ApiBearerAuth()
@Controller({
  path: 'vendor',
  version: '1',
})
export class VendorController {
  constructor(private readonly vendorService: VendorService) { }

  @Public()
  @Post()
  @ApiOperation({ summary: 'Create a new vendor profile' })
  @ApiResponse({ status: 201, description: 'Vendor created successfully' })
  @ApiResponse({ status: 409, description: 'Duplicate entry found' })
  createVendor(
    @Body() dto: CreateVendorDto,
  ) {
    return this.vendorService.createVendor(dto);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all vendors' })
  @ApiResponse({ status: 200, description: 'Vendors retrieved successfully' })
  async getAll(@Query() dto: PaginationDto) {
    return this.vendorService.getAll(dto);
  }



  @Get("monthly-order")
  @Roles(UserRole.VENDOR)
  @ApiOperation({ summary: "Get orders For Admin" })
  @ApiResponse({ status: 200, description: "Admin orders Retrived Successfully" })
  @ApiResponse({ status: 403, description: "Forbidden" })
  async getMonthlyOrders(@Query() dto: QueryFilterDto, @GetCurrentUserId() userId: string) {
    return await this.vendorService.getMonthlyOrders(dto, userId)
  }



  @Get("monthly-revenue")
  @Roles(UserRole.VENDOR)
  @ApiOperation({ summary: "Get orders For Admin" })
  @ApiResponse({ status: 200, description: "Admin orders Retrived Successfully" })
  @ApiResponse({ status: 403, description: "Forbidden" })
  async getMonthlyRevenue(@Query() dto: QueryFilterDto, @GetCurrentUserId() userId: string) {
    return await this.vendorService.getMonthlyRevenue(dto, userId)
  }



  @Get('summary/:id')
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @ApiOperation({ summary: 'Get Summary For Vendor Dashboard' })
  @ApiResponse({ status: 200, description: 'Vendors Summary Retrieved Successfully' })
  async getSummary(
    @Param("id") id: string,
    @Query() dto: QueryFilterDto
  ) {
    return await this.vendorService.summary(id, dto)
  }


  @Patch('profile/:userId')
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @ApiOperation({ summary: 'Update vendor profile details' })
  @ApiResponse({ status: 200, description: 'Vendor profile updated successfully' })
  @ApiResponse({ status: 404, description: 'Vendor not found' })
  async updateVendorProfile(
    @Param('userId') userId: string,
    @Body() dto: VendorProfileDto,
  ) {
    return await this.vendorService.updateVendorProfile(userId, dto);
  }



  @Get('profile/:userId')
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @ApiOperation({ summary: 'Get vendor details' })
  @ApiResponse({ status: 200, description: 'Vendor retrived successfully' })
  @ApiResponse({ status: 404, description: 'Vendor not found' })
  async getVendorByUserId(
    @Param('userId') userId: string
  ) {
    return await this.vendorService.getVendorByUserId(userId);
  }


  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get vendor by ID' })
  @ApiResponse({ status: 200, description: 'Vendor data retrieved' })
  @ApiResponse({ status: 404, description: 'Vendor not found' })
  getVendorById(@Param('id') id: string) {
    return this.vendorService.getVendorById(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @ApiOperation({ summary: 'Update vendor details' })
  @ApiResponse({ status: 200, description: 'Vendor updated successfully' })
  @ApiResponse({ status: 404, description: 'Vendor not found' })
  updateVendor(
    @Param('id') id: string,
    @Body() dto: Partial<CreateVendorDto>,
  ) {
    return this.vendorService.updateVendor(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete vendor by ID' })
  @ApiResponse({ status: 200, description: 'Vendor deleted successfully' })
  @ApiResponse({ status: 404, description: 'Vendor not found' })
  deleteVendor(@Param('id') id: string) {
    return this.vendorService.deleteVendor(id);
  }
}
