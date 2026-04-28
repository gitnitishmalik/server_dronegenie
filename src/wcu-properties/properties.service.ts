import { HttpException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { WCUPropertiesDto } from './dtos';
import { Express } from 'express';
import { PaginationDto } from 'src/common/dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class PropertiesService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    async create(data: WCUPropertiesDto, file?: Express.Multer.File) {
        let imageUrl: string | undefined;
        if (file) {
            imageUrl = file.filename;
        }

        return this.prisma.wCUProperties.create({
            data: {
                propHeading: data.propHeading,
                propDescription: data.propDescription,
                ...(data.propPriorty !== undefined && {
                    propPriorty: Number(data.propPriorty),
                }),
                ...(imageUrl && { propImage: imageUrl }),
            },
        });
    }

    async update(
        id: string,
        data: Partial<WCUPropertiesDto>,
        file?: Express.Multer.File,
    ) {
        const existing = await this.prisma.wCUProperties.findUnique({
            where: { id },
        });
        if (!existing) throw new NotFoundException('Property not found');

        let imageUrl: string | undefined;
        if (file) {
            imageUrl = file.filename;
        }

        return this.prisma.wCUProperties.update({
            where: { id },
            data: {
                ...(data.propHeading && { propHeading: data.propHeading }),
                ...(data.propDescription && { propDescription: data.propDescription }),
                ...(data.propPriorty !== undefined && {
                    propPriorty: Number(data.propPriorty),
                }),
                ...(imageUrl && { propImage: imageUrl }),
            },
        });
    }

    async delete(id: string) {
        try {
            const existing = await this.prisma.wCUProperties.findUnique({
                where: { id },
            });
            if (!existing) throw new NotFoundException('Property not found');

            return await this.prisma.$transaction(async (prisma) => {
                await prisma.wCUPropertiesCategory.deleteMany({ where: { propertyId: id } });
                await prisma.wCUPropertiesIndustry.deleteMany({ where: { propertyId: id } });
                return prisma.wCUProperties.delete({ where: { id } });
            });
        } catch (error) {
            console.log(error);
            if (error instanceof HttpException) throw error;
            throw new InternalServerErrorException('Internal server error');
        }
    }

    async get(id: string) {
        const property = await this.prisma.wCUProperties.findUnique({
            where: { id },
        });

        if (!property) {
            throw new NotFoundException('Property Not Found');
        }

        return property;
    }

    async getAll(dto: PaginationDto) {
        try {
            const {
                limit = '10',
                page = '1',
                search,
            } = dto;

            const take = Math.max(Number(limit) || 10, 1);
            const pageNumber = Math.max(Number(page) || 1, 1);
            const skip = (pageNumber - 1) * take;

            // build search filter
            const where: Prisma.WCUPropertiesWhereInput = {};

            if (search && search.trim() !== '') {
                where.OR = [
                    { propHeading: { contains: search, mode: 'insensitive' } },
                    { propDescription: { contains: search, mode: 'insensitive' } },
                ];
            }

            const [total, properties] = await this.prisma.$transaction([
                this.prisma.wCUProperties.count({ where }),
                this.prisma.wCUProperties.findMany({
                    where,
                    orderBy: { propPriorty: 'asc' },
                    skip,
                    take,
                }),
            ]);

            if (!properties || properties.length === 0) {
                throw new NotFoundException('Properties Not Found');
            }

            return {
                data: {
                    total,
                    page: pageNumber,
                    limit: take,
                    totalPages: Math.ceil(total / take),
                    properties
                },
            };
        } catch (error) {
            console.log(error);
            if (error instanceof HttpException) throw error;
            throw new InternalServerErrorException("Internal server error")
        }
    }

}
