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
import { DroneServiceService } from './drone-service.service';
import { CreateDroneServiceDto } from './dtos';
import { Public, Roles } from 'src/common/decorators';
import { UserRole } from '@prisma/client';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';
import { multerConfig } from 'src/config/multer.config';

@ApiTags('Services')
@ApiBearerAuth()
@Controller({
  path: 'service',
  version: '1',
})
export class DroneServiceController {
  constructor(private readonly service: DroneServiceService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('image', multerConfig))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Create a new service' })
  @ApiResponse({ status: 201, description: 'Service created successfully' })
  @ApiResponse({ status: 409, description: 'Duplicate entry found' })
  async create(
    @Body() dto: CreateDroneServiceDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return await this.service.create(dto, file);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all services' })
  @ApiResponse({ status: 200, description: 'Services retrieved successfully' })
  async getAll(@Query() dto: PaginationDto) {
    return this.service.getAll(dto);
  }

  @Public()
  @Get('all')
  @ApiOperation({ summary: 'Get All Services Name & ID' })
  @ApiResponse({ status: 200, description: 'Services data retrieved' })
  @ApiResponse({ status: 404, description: 'Services not found' })
  getServices() {
    return this.service.getAllServices();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get service by ID' })
  @ApiResponse({ status: 200, description: 'Service data retrieved' })
  @ApiResponse({ status: 404, description: 'Service not found' })
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Public()
  @Get('seo/:seoName')
  @ApiOperation({ summary: 'Get service by category/industry seo_name' })
  @ApiResponse({ status: 200, description: 'Service data retrieved' })
  @ApiResponse({ status: 404, description: 'Service not found' })
  async getServicesBySeoName(@Param('seoName') seoName: string) {
    return await this.service.getServicesBySeoName(seoName);
  }

  @Public()
  @Get(':userId/:categoryId')
  @ApiOperation({ summary: 'Get Services by Category ID' })
  @ApiResponse({ status: 200, description: 'Vendor Services data retrieved' })
  @ApiResponse({ status: 404, description: ' Vendor Services not found' })
  getServicesByCategoryId(
    @Param('categoryId') categoryId: string,
    @Param('userId') userId: string,
  ) {
    return this.service.getByCategoryId(categoryId, userId);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('image', multerConfig))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Update service details' })
  @ApiResponse({ status: 200, description: 'Service updated successfully' })
  @ApiResponse({ status: 404, description: 'Service not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateDroneServiceDto>,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return await this.service.update(id, dto, file);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete service by ID' })
  @ApiResponse({ status: 200, description: 'Service deleted successfully' })
  @ApiResponse({ status: 404, description: 'Service not found' })
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
