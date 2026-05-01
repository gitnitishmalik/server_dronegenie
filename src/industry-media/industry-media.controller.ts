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
import { IndustryMediaService } from './industry-media.service';
import { AtGaurd } from 'src/common/guards';
import { Roles } from 'src/common/decorators';
import { UserRole } from '@prisma/client';
import { IndustryMediaDto } from './dtos/industry-media.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { multerConfig } from 'src/config/multer.config';
import { ApiConsumes, ApiOperation } from '@nestjs/swagger';

@Controller({
  path: 'industry-media',
  version: '1',
})
export class IndustryMediaController {
  constructor(private readonly mediaService: IndustryMediaService) {}

  @UseGuards(AtGaurd)
  @Post()
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('url', multerConfig))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Industry media created successfully' })
  async create(
    @Body() dto: IndustryMediaDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return await this.mediaService.create(dto, file);
  }

  @UseGuards(AtGaurd)
  @Get('industry/:industryId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Industry media retrived successfully' })
  async getAll(@Param('industryId') industryId: string) {
    console.log(industryId, 'controller');

    return await this.mediaService.getAll(industryId);
  }

  @UseGuards(AtGaurd)
  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Industry media retrived successfully' })
  async get(@Param('id') id: string) {
    return await this.mediaService.get(id);
  }

  @UseGuards(AtGaurd)
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Industry media deleted successfully' })
  async delete(@Param('id') id: string) {
    return await this.mediaService.delete(id);
  }

  @UseGuards(AtGaurd)
  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('url', multerConfig))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Industry media updated successfully' })
  async update(
    @Param('id') id: string,
    @Body() dto: Partial<IndustryMediaDto>,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return await this.mediaService.update(id, dto, file);
  }
}
