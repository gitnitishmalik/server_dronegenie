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
import { PropertiesService } from './properties.service';
import { WCUPropertiesDto } from './dtos';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';
import { Roles } from 'src/common/decorators';
import { UserRole } from '@prisma/client';
import { multerConfig } from 'src/config/multer.config';
import { PaginationDto } from 'src/common/dto';

@ApiTags('WCU Properties')
@ApiBearerAuth()
@Controller({
  path: 'wcu-properties',
  version: '1',
})
export class PropertiesController {
  constructor(private readonly service: PropertiesService) { }

  @Post()
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('propImage', multerConfig))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Create a single WCU property for a drone service' })
  @ApiResponse({ status: 201, description: 'Property created successfully' })
  create(
    @Body() dto: WCUPropertiesDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.create(dto, file);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get Property' })
  @ApiResponse({ status: 200, description: 'Property Retrived successfully' })
  get(
    @Param('id') id: string,
  ) {
    return this.service.get(id);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get All Service Properties' })
  @ApiResponse({ status: 200, description: 'Properties Retrived successfully' })
  getAll(
    @Query() dto: PaginationDto,
  ) {
    return this.service.getAll(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('propImage', multerConfig))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Update a WCU property by ID' })
  @ApiResponse({ status: 200, description: 'Property updated successfully' })
  update(
    @Param('id') id: string,
    @Body() dto: Partial<WCUPropertiesDto>,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.update(id, dto, file);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete a WCU property by ID' })
  @ApiResponse({ status: 200, description: 'Property deleted successfully' })
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
