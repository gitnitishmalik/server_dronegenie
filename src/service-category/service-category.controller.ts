import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ServiceCategoryService } from './service-category.service';
import {
  CreateServiceCategoryDto,
  UpdateCategoryPropertiesDto,
  UpdateCategoryServicesDto,
} from './dto/create-service-category.dto';
import { Public, Roles } from 'src/common/decorators';
import { UserRole } from '@prisma/client';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';
import { multerConfig } from 'src/config/multer.config';

@ApiTags('ServiceCategory')
@ApiBearerAuth()
@Controller({
  path: 'service-category',
  version: '1',
})
export class ServiceCategoryController {
  constructor(
    private readonly serviceCategoryService: ServiceCategoryService,
  ) {}

  @Post('import')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', multerConfig))
  @ApiOperation({ summary: 'Import categories from CSV/Excel' })
  @ApiResponse({ status: 201, description: 'Categories imported successfully' })
  async importCategory(@UploadedFile() file: Express.Multer.File) {
    return this.serviceCategoryService.importFromExcel(file);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new category' })
  @ApiResponse({ status: 201, description: 'Category created successfully' })
  @ApiResponse({ status: 409, description: 'Duplicate entry found' })
  @UseInterceptors(FileInterceptor('image', multerConfig))
  async create(@Body() createServiceCategoryDto: CreateServiceCategoryDto) {
    return this.serviceCategoryService.create(createServiceCategoryDto);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get all categories' })
  @ApiResponse({
    status: 200,
    description: 'Categories retrieved successfully',
  })
  async findAll(@Query() dto: PaginationDto) {
    return this.serviceCategoryService.findAll(dto);
  }

  @Get('browse')
  @Public()
  @ApiOperation({ summary: 'Get all browse categories' })
  @ApiResponse({
    status: 200,
    description: 'Categories retrieved successfully',
  })
  async getForBrowse(@Query() dto: PaginationDto) {
    return this.serviceCategoryService.getForBrowse(dto);
  }

  // Previously @Public() — anyone could rewrite which services belong to a
  // category, silently breaking the public taxonomy shown on the site. Gated
  // to admin to match the adjacent @Patch('properties') route.
  @Patch('services')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Add services in category (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Service added in category successfully',
  })
  async updateCategoryServices(@Body() dto: UpdateCategoryServicesDto) {
    return this.serviceCategoryService.updateCategoryServices(dto);
  }

  @Patch('properties')
  @ApiOperation({ summary: 'Add properties in category' })
  @ApiResponse({
    status: 200,
    description: 'Properties added in category successfully',
  })
  async updateCategoryProperties(@Body() dto: UpdateCategoryPropertiesDto) {
    return this.serviceCategoryService.updateCategoryProperties(dto);
  }

  @Get('services/:categoryId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get Category Services Updated Successfully' })
  @ApiOperation({ summary: 'Industry Services Not Found' })
  async getCategoryServices(
    @Param('categoryId') categoryId: string,
    @Query() dto: PaginationDto,
  ) {
    return this.serviceCategoryService.getCategoryServices(categoryId, dto);
  }

  @Get('properties/:categoryId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Category Properties Updated Successfully' })
  @ApiOperation({ summary: 'Category Properties Not Found' })
  async getIndustryProperties(
    @Param('categoryId') categoryId: string,
    @Query() dto: PaginationDto,
  ) {
    return this.serviceCategoryService.getCategoryProperties(categoryId, dto);
  }

  @Public()
  @Get('seo/:seo_name')
  @ApiOperation({ summary: 'Get category by SEO name' })
  @ApiResponse({ status: 200, description: 'Category data retrieved' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async findBySeoName(@Param('seo_name') seoName: string) {
    return this.serviceCategoryService.findBySeoName(seoName);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get category by ID' })
  @ApiResponse({ status: 200, description: 'Category data retrieved' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async findOne(@Param('id') id: string) {
    return this.serviceCategoryService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update category details' })
  @ApiResponse({ status: 200, description: 'Category updated successfully' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  @UseInterceptors(FileInterceptor('image', multerConfig))
  async update(
    @Param('id') id: string,
    @Body() updateServiceCategoryDto: Partial<CreateServiceCategoryDto>,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.serviceCategoryService.update(
      id,
      updateServiceCategoryDto,
      file,
    );
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete category by ID' })
  @ApiResponse({ status: 200, description: 'Category deleted successfully' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async remove(@Param('id') id: string) {
    return this.serviceCategoryService.remove(id);
  }
}
