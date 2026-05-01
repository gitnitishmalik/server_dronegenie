import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Pagination } from 'src/common/decorators/pagination.decorator';
import { PaginationDto } from 'src/common/dto';
import { CreateFaqDto, GetFaqByRole, UpdateFaqDto } from './dtos/faq.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from '@prisma/client';

function getFriendlyUniqueMessage(target: unknown): string {
  // Prisma gives either an array of field names, or an index name string
  const targetStr = Array.isArray(target)
    ? target[0]
    : typeof target === 'string'
      ? target
      : '';

  if (targetStr.includes('priority') || targetStr.includes('priorty')) {
    return 'The given priority already exists.';
  }

  return 'A unique value already exists for this field.';
}

@Injectable({})
export class FaqService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateFaqDto) {
    try {
      const faq = await this.prisma.faq.create({
        data: {
          question: dto.question,
          answer: dto.answer,
          priorty: dto.priorty,
          isActive: dto.isActive,
          type: dto.type,
        },
      });

      return {
        error: 0,
        message: 'FAQ created successfully',
        data: faq,
      };
    } catch (e) {
      // Prisma unique violation
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const target = e.meta?.target;
        // If target is compound (array), provide a specific message
        if (Array.isArray(target) && target.length > 1) {
          // e.g. ['priorty','type']
          if (target.includes('priorty') && target.includes('type')) {
            // If dto.type is provided, include it for clarity
            const t = dto.type ?? 'this type';
            throw new BadRequestException(
              `Priority ${dto.priorty} is already used for type ${t}. Please choose a different priority for this type.`,
            );
          }
        }
        // fallback to your friendly helper for single-field target
        throw new BadRequestException(getFriendlyUniqueMessage(target));
      }

      // raw Mongo duplicate key fallback (code 11000)
      if (e?.code === 11000) {
        // prefer keyValue when available
        const keyValue = e.keyValue ?? {};
        const keys = Object.keys(keyValue);
        if (
          keys.length === 2 &&
          keys.includes('priorty') &&
          keys.includes('type')
        ) {
          const t = keyValue.type ?? dto.type ?? 'this type';
          const p = keyValue.priorty ?? dto.priorty;
          throw new BadRequestException(
            `Priority ${p} is already used for type ${t}.`,
          );
        }
        if (keys.length === 1) {
          const field = keys[0];
          throw new BadRequestException(getFriendlyUniqueMessage(field));
        }
        // generic fallback
        throw new BadRequestException('Duplicate key error');
      }

      // rethrow if it's a known client error
      if (e instanceof BadRequestException) throw e;

      throw new InternalServerErrorException('Something went wrong');
    }
  }

  @Pagination(['question', 'answer', 'priority'])
  async getAll(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    dto: PaginationDto,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    modelName: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    queryOptions: any,
  ): Promise<{
    total: number;
    page?: number;
    limit?: number;
    data: any[];
  }> {
    return {
      total: 0,
      page: 0,
      limit: 0,
      data: [],
    };
  }

  async get(id: string) {
    try {
      const faq = await this.prisma.faq.findUnique({ where: { id } });
      if (!faq) throw new NotFoundException('FAQ not found');

      return {
        error: 0,
        message: 'FAQ fetched successfully',
        data: faq,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Internal Server Error');
    }
  }

  async update(id: string, dto: UpdateFaqDto) {
    // declare item outside try so catch can reference it for error messages
    let item: any;

    try {
      item = await this.prisma.faq.findUnique({ where: { id } });
      if (!item) throw new NotFoundException('FAQ not found');

      const updateData: any = {};
      if (dto.question !== undefined) updateData.question = dto.question;
      if (dto.answer !== undefined) updateData.answer = dto.answer;
      if (dto.priorty !== undefined) updateData.priorty = dto.priorty;
      if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
      if (dto.type !== undefined) updateData.type = dto.type;

      const faq = await this.prisma.faq.update({
        where: { id },
        data: updateData,
      });

      return {
        error: 0,
        message: 'FAQ updated successfully',
        data: faq,
      };
    } catch (e: any) {
      // raw Mongo duplicate key fallback (code 11000)
      if (e?.code === 11000) {
        const keyValue = e.keyValue ?? {};
        const keys = Object.keys(keyValue);
        if (
          keys.length === 2 &&
          keys.includes('priorty') &&
          keys.includes('type')
        ) {
          const t = keyValue.type ?? dto.type ?? item?.type ?? 'this type';
          const p = keyValue.priorty ?? dto.priorty ?? item?.priorty;
          throw new BadRequestException(
            `Priority ${p} is already used for type ${t}.`,
          );
        }
        if (keys.length === 1) {
          const field = keys[0];
          throw new BadRequestException(getFriendlyUniqueMessage(field));
        }
        throw new BadRequestException('Duplicate key error');
      }

      // Prisma unique violation
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const target = e.meta?.target;
        if (Array.isArray(target) && target.length > 1) {
          if (target.includes('priorty') && target.includes('type')) {
            const t = dto.type ?? item?.type ?? 'this type';
            const p = dto.priorty ?? item?.priorty;
            throw new BadRequestException(
              `Priority ${p} is already used for type ${t}. Please choose a different priority for this type.`,
            );
          }
        }
        throw new BadRequestException(getFriendlyUniqueMessage(target));
      }

      if (e instanceof NotFoundException || e instanceof BadRequestException)
        throw e;
      // this.logger?.error?.('FAQ update error', e);
      throw new InternalServerErrorException('Something Went Wrong');
    }
  }

  async delete(id: string) {
    try {
      const faq = await this.prisma.faq.findUnique({ where: { id } });
      if (!faq) throw new NotFoundException('FAQ not found');

      await this.prisma.faq.delete({ where: { id } });

      return {
        error: 0,
        message: 'FAQ deleted successfully',
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Internal Server Error');
    }
  }

  async getByRole(dto: GetFaqByRole) {
    try {
      const faqs = await this.prisma.faq.findMany({
        where: { type: dto.type, isActive: true },
      });

      if (!faqs) throw new NotFoundException('Faq not found');

      return {
        error: 0,
        message: 'Faq retrived successfully',
        data: faqs,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Internal server error');
    }
  }
}
