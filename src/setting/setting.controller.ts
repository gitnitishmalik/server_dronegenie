import {
  Controller,
  Post,
  Get,
  Param,
  Patch,
  Delete,
  Body,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';

import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
} from '@nestjs/swagger';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { SettingService } from './setting.service';
import { CreateSettingDto, UpdateSettingDto } from './dtos';
import { Public, Roles } from 'src/common/decorators';
import { UserRole } from '@prisma/client';
import { multerAnyFilesConfig } from 'src/config/multer.config';

@ApiTags('Setting')
@ApiBearerAuth()
@Controller({ path: 'settings', version: '1' })
export class SettingController {
  constructor(private readonly settingService: SettingService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @UseInterceptors(AnyFilesInterceptor(multerAnyFilesConfig))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Create Setting' })
  createSetting(
    @Body() dto: CreateSettingDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.settingService.create(dto, files);
  }

  @Get()
  @Public()
  getAllSettings() {
    return this.settingService.findAll();
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  getById(@Param('id') id: string) {
    return this.settingService.findById(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(AnyFilesInterceptor(multerAnyFilesConfig))
  @ApiConsumes('multipart/form-data')
  updateSetting(
    @Param('id') id: string,
    @Body() dto: UpdateSettingDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.settingService.update(id, dto, files);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  delete(@Param('id') id: string) {
    return this.settingService.delete(id);
  }
}
