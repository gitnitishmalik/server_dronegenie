import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateMetaDto, UpdateMetaDto } from './dtos/seo-meta.dto';
import { PaginationDto } from 'src/common/dto';

@Injectable({})
export class SeoMetaService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMetaDto) {
    try {
      const meta = await this.prisma.seo_Meta.create({
        data: {
          ...dto,
        },
      });

      return {
        data: meta,
      };
    } catch (error) {
      throw error;
    }
  }

  async getAll(dto: PaginationDto) {
    try {
      const page = dto.page ? Number(dto.page) : 1;
      const limit = dto.limit ? Number(dto.limit) : 10;
      const skip = (page - 1) * limit;

      const where = {} as any;
      if (dto.search) {
        where.name = dto.search;
      }

      const [data, total] = await Promise.all([
        this.prisma.seo_Meta.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.seo_Meta.count(),
      ]);

      return {
        total,
        page,
        limit,
        lastPage: Math.ceil(total / limit),
        data,
      };
    } catch (error) {
      throw error;
    }
  }

  async getById(page: string) {
    try {
      const meta = await this.prisma.seo_Meta.findUnique({
        where: { pageName: page },
      });
      if (!meta) throw new NotFoundException('Meta not found');

      return {
        data: meta,
      };
    } catch (error) {
      throw error;
    }
  }

  async delete(id: string) {
    try {
      const meta = await this.prisma.seo_Meta.findUnique({
        where: { id },
      });
      if (!meta) throw new NotFoundException('Meta not found');

      return this.prisma.seo_Meta.delete({
        where: { id },
      });
    } catch (error) {
      throw error;
    }
  }

  async update(dto: UpdateMetaDto, id: string) {
    try {
      const meta = await this.prisma.seo_Meta.findUnique({
        where: { id },
      });
      if (!meta) throw new NotFoundException('Meta not found');

      const data = {} as any;

      if (dto.pageName !== undefined) data.pageName = dto.pageName;
      if (dto.metaTitle !== undefined) data.metaTitle = dto.metaTitle;
      if (dto.metaDescription !== undefined)
        data.metaDescription = dto.metaDescription;
      if (dto.metaKeyword !== undefined) data.metaKeyword = dto.metaKeyword;

      return await this.prisma.seo_Meta.update({
        where: { id: meta.id },
        data: {
          ...data,
        },
      });
    } catch (error) {
      throw error;
    }
  }
}
