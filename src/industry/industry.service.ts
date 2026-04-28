// industry.service.ts
import { BadRequestException, HttpException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIndustryDto, UpdateIndustryDto, UpdateIndustryPropertiesDto, UpdateIndustryServicesDto } from './dtos/create-industry.dto';
import { Pagination } from 'src/common/decorators/pagination.decorator';
import { PaginationDto } from 'src/common/dto';
import { generateSeoName } from 'src/common/utils/seo.util';
import { Prisma } from '@prisma/client';
// import { UpdateIndustryDto } from './dto/update-industry.dto';

@Injectable()
export class IndustryService {
  constructor(
    private prisma: PrismaService,
  ) { }

  async create(dto: CreateIndustryDto, file: Express.Multer.File) {
    try {
      let imageUrl: string;

      // 1. Upload the image (if file is provided)
      if (file) {
        imageUrl = file.filename
      } else {
        throw new Error('Image file is required');
      }

      const industryName = dto.industry_name?.trim();

      // ✅ SEO fallback logic
      const metaTitle =
        dto.metaTitle?.trim() || industryName;

      const metaDescription =
        dto.metaDescription?.trim() || industryName;

      const metaKeyword =
        dto.metaKeyword?.trim() || industryName;

      const industry = await this.prisma.industry.create({
        data: {
          industry_name: dto.industry_name,
          industry_seo_name: generateSeoName(dto.industry_name),
          description: dto.description,
          priorty: dto.priorty,
          image: imageUrl,
          status: dto.status,

          // ✅ meta fields
          metaTitle,
          metaDescription,
          metaKeyword,
        },
      });

      return industry;
    } catch (error) {
      return error;
    }
  }

  // @Pagination(['industry_name', 'description', 'priorty'])
  // async getAll(
  //   dto: PaginationDto,
  //   modelName: string,
  //   queryOptions: any,
  // ): Promise<{
  //   total: number;
  //   page: number;
  //   limit: number;
  //   data: any[];
  // }> {
  //   // Add include to query options
  //   const updatedQueryOptions = {
  //     ...queryOptions,
  //     include: {
  //       services: true
  //     }
  //   };

  //   // Your pagination decorator should handle this
  //   // If it doesn't support include, you'll need to modify the pagination logic
  //   return {
  //     total: 0,
  //     page: 0,
  //     limit: 0,
  //     data: [],
  //   };
  // }

  async getAll(dto: PaginationDto) {
    try {
      const page = dto.page ? parseInt(dto.page) : 1;
      const limit = dto.limit ? parseInt(dto.limit) : 10;
      const skip = (page - 1) * limit;

      const where: Prisma.IndustryWhereInput = {
        ...(dto.search && {
          OR: [
            {
              industry_name: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            {
              industry_seo_name: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            {
              description: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
          ],
        }),
      };

      const [data, total] = await Promise.all([
        this.prisma.industry.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            priorty: 'asc',
          },
          include: {
            droneServices: {
              select: {
                id: true,
                service: {
                  select: {
                    id: true,
                    service_name: true
                  }
                }
              }
            },
            media: true
          }
        }),
        this.prisma.industry.count({ where }),
      ]);

      return {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data
      }
    } catch (error) {
      throw error;
    }
  }


  async getBrowseFor(dto: PaginationDto) {
    try {
      const page = dto.page ? parseInt(dto.page) : 1;
      const limit = dto.limit ? parseInt(dto.limit) : 10;
      const skip = (page - 1) * limit;
      console.log(dto);


      const where: Prisma.IndustryWhereInput = {
        status: 'ACTIVE',
        ...(dto.search && {
          OR: [
            {
              industry_name: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            {
              industry_seo_name: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            {
              description: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
          ],
        }),
      };

      const [data, total] = await Promise.all([
        this.prisma.industry.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            priorty: 'asc',
          },
          include: {
            droneServices: {
              select: {
                id: true,
                service: {
                  select: {
                    id: true,
                    service_name: true
                  }
                }
              }
            },
            media: true
          }
        }),
        this.prisma.industry.count({ where }),
      ]);

      return {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data
      }
    } catch (error) {
      throw error;
    }
  }


  async findOne(id: string) {
    const industry = await this.prisma.industry.findUnique({
      where: { id },
      include: {
        media: true,
        droneServices: {
          select: {
            id: true,
            service: {
              select: {
                id: true,
                service_name: true
              }
            }
            // properties: true,
            // category: {
            //   select:{
            //     id: true,
            //     category_name: true
            //   }
            // },
            // industry: {
            //   select: {
            //     id: true,
            //     industry_name: true
            //   }
            // }
          }
        },
        wcuProperties: {
          select: {
            id: true,
            property: true
          }
        }
      },
    });

    if (!industry) throw new NotFoundException('Industry not found');

    return industry;
  }

  async update(id: string, dto: UpdateIndustryDto, file?: Express.Multer.File) {
    try {
      const existingIndustry = await this.prisma.industry.findUnique({
        where: { id },
      });

      if (!existingIndustry) {
        throw new NotFoundException('Industry not found');
      }

      let imageUrl: string | undefined;
      if (file) {
        imageUrl = file.filename
      }

      // ✅ final name (new OR existing)
      const finalIndustryName = (
        dto.industry_name || existingIndustry.industry_name
      )?.trim();

      // ✅ SEO fallback
      const metaTitle =
        dto.metaTitle?.trim() || finalIndustryName;

      const metaDescription =
        dto.metaDescription?.trim() || finalIndustryName;

      const metaKeyword =
        dto.metaKeyword?.trim() || finalIndustryName;


      // Build update object
      const updateData: any = {
        metaTitle,
        metaDescription,
        metaKeyword,
      };

      if (dto.industry_name !== undefined) updateData.industry_name = dto.industry_name;
      if (dto.industry_name !== undefined) updateData.industry_seo_name = generateSeoName(dto.industry_name);
      if (dto.description !== undefined) updateData.description = dto.description;
      if (dto.priorty !== undefined) updateData.priorty = dto.priorty;
      if (dto.status !== undefined) updateData.status = dto.status;
      if (imageUrl) updateData.image = imageUrl;


      const updatedIndustry = await this.prisma.industry.update({
        where: { id },
        data: updateData,
      });

      return updatedIndustry;
    } catch (error) {
      console.error('Update error:', error);
      throw error;
    }
  }



  async remove(id: string) {
    return this.prisma.industry.delete({ where: { id } });
  }


  async updateIndustryServices(dto: UpdateIndustryServicesDto) {
    const { industryId, addServiceIds = [], removeServiceIds = [] } = dto;

    if (!addServiceIds.length && !removeServiceIds.length) {
      throw new BadRequestException(
        'Nothing to update: addServiceIds or removeServiceIds required',
      );
    }

    // Ensure industry exists
    const industry = await this.prisma.industry.findUnique({
      where: { id: industryId },
    });

    if (!industry) {
      throw new NotFoundException('Industry not found');
    }

    const txOps: Prisma.PrismaPromise<any>[] = [];

    // ADD relations
    if (addServiceIds.length) {
      txOps.push(
        this.prisma.droneServiceIndustry.createMany({
          data: addServiceIds.map((serviceId) => ({
            industryId,
            serviceId,
          })),
          // optional if supported in your setup:
          // skipDuplicates: true,
        }),
      );
    }

    // REMOVE relations
    if (removeServiceIds.length) {
      txOps.push(
        this.prisma.droneServiceIndustry.deleteMany({
          where: {
            industryId,
            serviceId: { in: removeServiceIds },
          },
        }),
      );
    }

    await this.prisma.$transaction(txOps);

    // Return updated industry with its services
    return this.prisma.industry.findUnique({
      where: { id: industryId },
      include: {
        droneServices: {
          include: {
            service: true, // DroneService data
          },
        },
      },
    });
  }


  async getServiceIndustries(industryId: string, dto: PaginationDto) {
    try {
      // 1. Make sure industry exists
      const industry = await this.prisma.industry.findUnique({
        where: { id: industryId },
        select: { id: true },
      });

      if (!industry) {
        throw new NotFoundException('Industry not found');
      }

      // 2. Pagination & search params
      const {
        limit = '10',
        page = '1',
        search,
      } = dto;

      const take = Math.max(Number(limit) || 10, 1);
      const pageNumber = Math.max(Number(page) || 1, 1);
      const skip = (pageNumber - 1) * take;

      // 3. Build where filter on DroneService
      const where: Prisma.DroneServiceWhereInput = {
        industries: {
          some: {
            industryId,
          },
        },
      };

      if (search && search.trim() !== '') {
        where.service_name = {
          contains: search.trim(),
          mode: 'insensitive',
        };
      }

      // 4. Count + fetch services in a transaction
      const [total, services] = await this.prisma.$transaction([
        this.prisma.droneService.count({ where }),
        this.prisma.droneService.findMany({
          where,
          orderBy: { priorty: 'asc' },
          skip,
          take,
          select: {
            id: true,
            service_name: true,
            service_seo_name: true,
            priorty: true,
            image: true,
          },
        }),
      ]);

      if (!services || services.length === 0) {
        throw new NotFoundException('Services not found');
      }

      return {
        message: 'Industry services retrieved successfully',
        data: {
          total,
          page: pageNumber,
          limit: take,
          totalPages: Math.ceil(total / take),
          services
        },
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Internal server error');
    }
  }


  async getServicesByIndustrySeoname(seo_name: string, dto: PaginationDto) {
    try {
      const industry = await this.prisma.industry.findFirst({
        where: { industry_seo_name: seo_name },
        include: {
          media: true,
          droneServices: {
            select: {
              id: true,
              service: {
                select: {
                  id: true,
                  service_name: true
                }
              }
            }
          },
          wcuProperties: {
            select: {
              id: true,
              property: true
            }
          }
        },
      });

      if (!industry) throw new NotFoundException('Industry not found');

      return industry;
    } catch (error) {
      throw error;
    }
  }


  async getIndustryProperties(industryId: string, dto: PaginationDto) {
    try {
      // 1. Ensure industry exists
      const industry = await this.prisma.industry.findUnique({
        where: { id: industryId },
        select: { id: true },
      });

      if (!industry) {
        throw new NotFoundException('Industry not found');
      }

      // 2. Pagination + search
      const {
        limit = '10',
        page = '1',
        search,
      } = dto;

      const take = Math.max(Number(limit) || 10, 1);
      const pageNumber = Math.max(Number(page) || 1, 1);
      const skip = (pageNumber - 1) * take;

      // 3. Build where filter on WCUProperties
      const where: Prisma.WCUPropertiesWhereInput = {
        industries: {
          some: {
            industryId,
          },
        },
      };

      if (search && search.trim() !== '') {
        const s = search.trim();
        where.OR = [
          { propHeading: { contains: s, mode: 'insensitive' } },
          { propDescription: { contains: s, mode: 'insensitive' } },
        ];
      }

      // 4. Count + fetch properties
      const [total, properties] = await this.prisma.$transaction([
        this.prisma.wCUProperties.count({ where }),
        this.prisma.wCUProperties.findMany({
          where,
          orderBy: { propPriorty: 'asc' },
          skip,
          take,
          select: {
            id: true,
            propHeading: true,
            propDescription: true,
            propImage: true,
            propPriorty: true,
          },
        }),
      ]);

      if (!properties || properties.length === 0) {
        throw new NotFoundException('Properties not found');
      }

      return {
        message: 'Industry properties retrieved successfully',
        data: {
          total,
          page: pageNumber,
          limit: take,
          totalPages: Math.ceil(total / take),
          properties
        },
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Internal server error');
    }
  }



  async updateIndustryProperties(dto: UpdateIndustryPropertiesDto) {
    const { industryId, addPropertyIds = [], removePropertyIds = [] } = dto;

    if (!addPropertyIds.length && !removePropertyIds.length) {
      throw new BadRequestException(
        'Nothing to update: addPropertyIds or removePropertyIds required',
      );
    }

    // ensure industry exists
    const industry = await this.prisma.industry.findUnique({
      where: { id: industryId },
    });

    if (!industry) {
      throw new NotFoundException('Industry not found');
    }

    const txOps: Prisma.PrismaPromise<any>[] = [];

    // ADD relations
    if (addPropertyIds.length) {
      txOps.push(
        this.prisma.wCUPropertiesIndustry.createMany({
          data: addPropertyIds.map((propertyId) => ({
            industryId,
            propertyId,
          })),
          // skipDuplicates: true, // optional
        }),
      );
    }

    // REMOVE relations
    if (removePropertyIds.length) {
      txOps.push(
        this.prisma.wCUPropertiesIndustry.deleteMany({
          where: {
            industryId,
            propertyId: { in: removePropertyIds },
          },
        }),
      );
    }

    await this.prisma.$transaction(txOps);

    // return updated industry with its properties
    return this.prisma.industry.findUnique({
      where: { id: industryId },
      include: {
        wcuProperties: {
          include: {
            property: true, // adjust name if needed per your Prisma client
          },
        },
      },
    });
  }
}
