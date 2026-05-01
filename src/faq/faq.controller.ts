import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  InternalServerErrorException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FaqService } from './faq.service';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public, Roles } from 'src/common/decorators';
import { UserRole } from '@prisma/client';
import { CreateFaqDto, GetFaqByRole, UpdateFaqDto } from './dtos/faq.dto';
import { PaginationDto } from 'src/common/dto';
import { AtGaurd } from 'src/common/guards';

@ApiTags('FAQ')
@Controller({
  path: 'faq',
  version: '1',
})
export class FaqController {
  constructor(private readonly faqService: FaqService) {}

  @UseGuards(AtGaurd)
  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create FAQ' })
  @ApiResponse({ status: 201, description: 'FAQ created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async create(@Body() dto: CreateFaqDto) {
    return await this.faqService.create(dto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get All FAQ' })
  @ApiResponse({ status: 200, description: 'FAQ Retrived successfully' })
  @ApiResponse({ status: 404, description: 'Unautorized.' })
  async getAll(@Query() dto: PaginationDto) {
    try {
      const faqs = await this.faqService.getAll(dto, 'faq', {
        where: {},
        orderBy: {
          createdAt: 'desc', // 👈 latest first
        },
      });

      return {
        error: 0,
        message: 'FAQ retrieved successfully',
        data: faqs,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Internal Server Error');
    }
  }

  @Public()
  @Get('by-role')
  @ApiOperation({ summary: 'Get FAQ by role' })
  @ApiResponse({ status: 200, description: 'FAQ retrieved successfully' })
  @ApiResponse({ status: 404, description: 'FAQ not found' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async getByRole(@Query() dto: GetFaqByRole) {
    return await this.faqService.getByRole(dto);
  }

  @UseGuards(AtGaurd)
  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get FAQ by ID' })
  @ApiResponse({ status: 200, description: 'FAQ retrieved successfully' })
  @ApiResponse({ status: 404, description: 'FAQ not found' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async get(@Param('id') id: string) {
    return await this.faqService.get(id);
  }

  @UseGuards(AtGaurd)
  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update FAQ by ID' })
  @ApiResponse({ status: 200, description: 'FAQ updated successfully' })
  @ApiResponse({ status: 404, description: 'FAQ not found' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async update(@Param('id') id: string, @Body() dto: UpdateFaqDto) {
    return await this.faqService.update(id, dto);
  }

  @UseGuards(AtGaurd)
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete FAQ by ID' })
  @ApiResponse({ status: 200, description: 'FAQ deleted successfully' })
  @ApiResponse({ status: 404, description: 'FAQ not found' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async delete(@Param('id') id: string) {
    return await this.faqService.delete(id);
  }
}
