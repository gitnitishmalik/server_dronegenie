import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CustomerService } from './customer.service';
import { CreateCustomerDto, GetCustomerDto, UpdateCustomerProfileDto } from './dtos';
import { Public, Roles } from 'src/common/decorators';
import { UserRole } from '@prisma/client';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import { QueryFilterDto } from 'src/admin/dtos/admin.dto';

@ApiTags('Customers')
@ApiBearerAuth()
@Controller({
  path: 'customer',
  version: '1',
})
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Public()
  @Post()
  @ApiOperation({ summary: 'Create a new customer profile' })
  @ApiResponse({ status: 201, description: 'Customer created successfully' })
  @ApiResponse({ status: 409, description: 'Duplicate entry found' })
  createCustomer(@Body() dto: CreateCustomerDto) {
    return this.customerService.createCustomer(dto);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all customers' })
  @ApiResponse({ status: 200, description: 'Customers retrieved successfully' })
  async getAll(@Query() dto: PaginationDto) {
    return this.customerService.getAll(dto);
  }


  @Get('summary/:id')
  @Roles(UserRole.ADMIN, UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Get Summary For Customer Dashboard' })
  @ApiResponse({ status: 200, description: 'Customers Summary Retrieved Successfully' })
  async getSummary(
    @Param('id') id: string,
    @Query() dto: QueryFilterDto) {
    return await this.customerService.summary(id, dto)
  }


  @Patch('profile/:userId')
  @Roles(UserRole.ADMIN, UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Update customer profile details' })
  @ApiResponse({ status: 200, description: 'Customer profile updated successfully' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  profileUpdateCustomer(@Param('userId') userId: string, @Body() dto: UpdateCustomerProfileDto) {
    return this.customerService.profileUpdateCustomer(userId, dto);
  }



  @Get('profile/:userId')
  @Roles(UserRole.ADMIN, UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Get customer details' })
  @ApiResponse({ status: 200, description: 'Customer retrived successfully' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  getCustomerByUserId(@Param('userId') userId: string) {
    return this.customerService.getCustomerByUserId(userId);
  }

  
  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get customer by ID' })
  @ApiResponse({ status: 200, description: 'Customer data retrieved' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  getCustomerById(@Param('id') id: string) {
    return this.customerService.getCustomerById(id);
  }


  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.CUSTOMER)
  @ApiOperation({ summary: 'Update customer details' })
  @ApiResponse({ status: 200, description: 'Customer updated successfully' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  updateCustomer(@Param('id') id: string, @Body() dto: Partial<CreateCustomerDto>) {
    return this.customerService.updateCustomer(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete customer by ID' })
  @ApiResponse({ status: 200, description: 'Customer deleted successfully' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  deleteCustomer(@Param('id') id: string) {
    return this.customerService.deleteCustomer(id);
  }


  
}