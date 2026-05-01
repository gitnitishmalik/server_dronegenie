import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateVendorDocDto } from './dtos/vendor-doc.dto';

@Injectable({})
export class VendorDocumentService {
  constructor(private readonly prisma: PrismaService) {}

  async createDoc(dto: CreateVendorDocDto, file?: Express.Multer.File) {
    try {
      if (!file) {
        throw new ConflictException('Document file is required');
      }

      const documentUrl = file.filename;

      const { userId, title } = dto;

      const vendor = await this.prisma.vendor.findUnique({
        where: { userId },
        select: { id: true },
      });

      if (!vendor) {
        throw new NotFoundException('Vendor not found for the given user ID');
      }

      return await this.prisma.vendorDocument.create({
        data: {
          vendorId: vendor.id,
          title,
          document: documentUrl,
        },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          'Vendor with provided unique fields already exists',
        );
      }
      throw error;
    }
  }

  async getAllDocsByUserId(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!vendor) throw new NotFoundException('Vendor not found');

    return this.prisma.vendorDocument.findMany({
      where: { vendorId: vendor.id },
    });
  }

  // ✅ Get document by ID
  async getById(id: string) {
    const doc = await this.prisma.vendorDocument.findUnique({
      where: { id },
    });

    if (!doc) throw new NotFoundException('Document not found');

    return doc;
  }

  // ✅ Update document by ID
  async update(
    id: string,
    dto: Partial<CreateVendorDocDto>,
    file?: Express.Multer.File,
  ) {
    const existingDoc = await this.prisma.vendorDocument.findUnique({
      where: { id },
    });

    if (!existingDoc) throw new NotFoundException('Document not found');

    let documentUrl: string | undefined;

    if (file) {
      documentUrl = file.filename;
    }

    return this.prisma.vendorDocument.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(documentUrl && { document: documentUrl }),
      },
    });
  }

  // ✅ Delete document by ID
  async delete(id: string) {
    const existingDoc = await this.prisma.vendorDocument.findUnique({
      where: { id },
    });

    if (!existingDoc) throw new NotFoundException('Document not found');

    return this.prisma.vendorDocument.delete({
      where: { id },
    });
  }
}
