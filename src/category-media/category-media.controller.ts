import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CategoryMediaService } from './category-media.service';
import { AtGaurd } from 'src/common/guards';
import { Roles } from 'src/common/decorators';
import { UserRole } from '@prisma/client';
import { CategoryMediaDto } from './dtos/category-media.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { multerConfig } from 'src/config/multer.config';
import { ApiConsumes, ApiOperation } from '@nestjs/swagger';

@Controller({
  path: 'category-media',
  version: '1',
})
export class CategoryMediaController {
  constructor(private readonly mediaService: CategoryMediaService) {}

  @UseGuards(AtGaurd)
  @Post()
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('url', multerConfig))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Category media created successfully' })
  async create(
    @Body() dto: CategoryMediaDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    console.log('Entry controller');
    return await this.mediaService.create(dto, file);
  }

  @UseGuards(AtGaurd)
  @Get('category/:categoryId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Category media retrived successfully' })
  async getAll(@Param('categoryId') categoryId: string) {
    return await this.mediaService.getAll(categoryId);
  }

  @UseGuards(AtGaurd)
  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Category media retrived successfully' })
  async get(@Param('id') id: string) {
    return await this.mediaService.get(id);
  }

  @UseGuards(AtGaurd)
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Category media deleted successfully' })
  async delete(@Param('id') id: string) {
    return await this.mediaService.delete(id);
  }

  @UseGuards(AtGaurd)
  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('url', multerConfig))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Category media updated successfully' })
  async update(
    @Param('id') id: string,
    @Body() dto: Partial<CategoryMediaDto>,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return await this.mediaService.update(id, dto, file);
  }
}
