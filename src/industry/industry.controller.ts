// industry.controller.ts
import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseInterceptors,
  UploadedFile,
  Query,
} from '@nestjs/common';
import { IndustryService } from './industry.service';
import {
  CreateIndustryDto,
  UpdateIndustryPropertiesDto,
  UpdateIndustryServicesDto,
} from './dtos/create-industry.dto';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public, Roles } from 'src/common/decorators';
import { UserRole } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { PaginationDto } from 'src/common/dto';
import { UpdateIndustryDto } from './dtos/create-industry.dto';
import { multerConfig } from 'src/config/multer.config';

@ApiTags('Industry')
@ApiBearerAuth()
@Controller({
  path: 'industry',
  version: '1',
})
export class IndustryController {
  constructor(private readonly industryService: IndustryService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('image', multerConfig))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Create Industry' })
  create(
    @Body() dto: CreateIndustryDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.industryService.create(dto, file);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'All Industries Retrived Successfully' })
  @ApiOperation({ summary: 'Not Found' })
  getAll(@Query() dto: PaginationDto) {
    return this.industryService.getAll(dto);
  }

  @Get('browse')
  @Public()
  @ApiOperation({ summary: 'All Industries Retrived Successfully' })
  @ApiOperation({ summary: 'Not Found' })
  getBrowseFor(@Query() dto: PaginationDto) {
    return this.industryService.getBrowseFor(dto);
  }

  @Patch('services')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Industry Services Updated Successfully' })
  @ApiOperation({ summary: 'Industry Services Not Found' })
  async updateServiceIndustries(@Body() dto: UpdateIndustryServicesDto) {
    return this.industryService.updateIndustryServices(dto);
  }

  @Patch('properties')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Industry Properties Updated Successfully' })
  @ApiOperation({ summary: 'Industry Properties Not Found' })
  async updateIndustryProperties(@Body() dto: UpdateIndustryPropertiesDto) {
    return this.industryService.updateIndustryProperties(dto);
  }

  @Public()
  @Get('seo/:seo_name')
  @ApiOperation({ summary: 'Get Industry Services By Seo_name' })
  @ApiOperation({ summary: 'Industry Services Not Found' })
  async getServicesByIndustrySeoname(@Param('seo_name') seo_name: string) {
    return this.industryService.getServicesByIndustrySeoname(seo_name);
  }

  @Get('services/:indusrtyId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get Industry Services Updated Successfully' })
  @ApiOperation({ summary: 'Industry Services Not Found' })
  async getServiceIndustries(
    @Param('indusrtyId') indusrtyId: string,
    @Query() dto: PaginationDto,
  ) {
    return this.industryService.getServiceIndustries(indusrtyId, dto);
  }

  @Get('properties/:indusrtyId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Industry Properties Updated Successfully' })
  @ApiOperation({ summary: 'Industry Properties Not Found' })
  async getIndustryProperties(
    @Param('indusrtyId') indusrtyId: string,
    @Query() dto: PaginationDto,
  ) {
    return this.industryService.getIndustryProperties(indusrtyId, dto);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Industry Retrived Successfully' })
  @ApiOperation({ summary: 'Industry Not Found' })
  findOne(@Param('id') id: string) {
    return this.industryService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Industry Updated Successfully' })
  @ApiOperation({ summary: 'Industry Not Found' })
  @UseInterceptors(FileInterceptor('image', multerConfig))
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateIndustryDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.industryService.update(id, dto, file);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Industry Removed Successfully' })
  @ApiOperation({ summary: 'Industry Not Found' })
  remove(@Param('id') id: string) {
    return this.industryService.remove(id);
  }
}
