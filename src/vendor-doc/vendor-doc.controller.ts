import {
  Body,
  Controller,
  Post,
  Get,
  Param,
  Delete,
  Patch,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { VendorDocumentService } from './vendor-doc.service';
import { Roles } from 'src/common/decorators';
import { CreateVendorDocDto } from './dtos/vendor-doc.dto';
import { UserRole } from '@prisma/client';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { Express } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { PrismaService } from 'src/prisma/prisma.service';
import { multerConfig } from 'src/config/multer.config';

@ApiTags()
@ApiBearerAuth()
@Controller({
  path: 'vendor-doc',
  version: '1',
})
export class VendorDocumentController {
  constructor(
    private readonly vendorDocumentService: VendorDocumentService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @UseInterceptors(FileInterceptor('document', multerConfig))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Create A Vendor Document' })
  @ApiResponse({
    status: 200,
    description: 'Vendors Document Craeted successfully',
  })
  createDoc(
    @Body() dto: CreateVendorDocDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.vendorDocumentService.createDoc(dto, file);
  }

  // Removed: fixAllDroneServiceImageUrls (was PATCH /fix-all-img-urls @Public())
  // One-shot migration utility that iterated + mutated the invoice table.
  // Anyone could trigger a full-table loop anonymously. If this migration
  // ever needs to run again, do it as a script (scripts/migrate-legacy-upload-urls.ts),
  // not as an HTTP endpoint. Note: original method was misnamed (says "droneService"
  // but queried the invoice model — copy-paste bug).

  // ✅ Get all documents for a vendor
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @Get('all/:userId')
  getAllDocs(@Param('userId') userId: string) {
    return this.vendorDocumentService.getAllDocsByUserId(userId);
  }

  // ✅ Get document by ID
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @Get(':id')
  getDocById(@Param('id') id: string) {
    return this.vendorDocumentService.getById(id);
  }

  // ✅ Update document
  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @UseInterceptors(FileInterceptor('document', multerConfig))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Update Vendor Document details' })
  @ApiResponse({
    status: 200,
    description: 'Vendor Document updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Vendor Document not found' })
  updateDoc(
    @Param('id') id: string,
    @Body() dto: Partial<CreateVendorDocDto>,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.vendorDocumentService.update(id, dto, file);
  }

  // ✅ Delete document
  @Roles(UserRole.ADMIN, UserRole.VENDOR)
  @Delete(':id')
  deleteDoc(@Param('id') id: string) {
    return this.vendorDocumentService.delete(id);
  }
}
