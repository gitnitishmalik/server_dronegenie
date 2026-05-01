import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateDroneServiceDto } from './dtos';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import { generateSeoName } from 'src/common/utils/seo.util';
import { Prisma } from '@prisma/client';

function getFriendlyUniqueMessage(target: unknown): string {
  // Prisma gives either an array of field names, or an index name string
  const targetStr = Array.isArray(target)
    ? target[0]
    : typeof target === 'string'
      ? target
      : '';

  if (targetStr.includes('service_seo_name')) {
    return 'The given service name already exists.';
  }

  if (targetStr.includes('priorty')) {
    return 'The given priority already exists.';
  }

  return 'A unique value already exists for this field.';
}

@Injectable()
export class DroneServiceService {
  constructor(private readonly prisma: PrismaService) {}

  private handleDuplicateError(target: unknown) {
    const message = getFriendlyUniqueMessage(target);
    throw new BadRequestException(message);
  }

  async create(dto: CreateDroneServiceDto, file?: Express.Multer.File) {
    try {
      let imageUrl: string | undefined;
      if (file) {
        imageUrl = file.filename;
      }

      const { categoryId, industryId, ...rest } = dto;

      const serviceName = dto.service_name?.trim();

      const metaTitle = dto.metaTitle?.trim() || serviceName;
      const metaDescription = dto.metaDescription?.trim() || serviceName;
      const metaKeyword = dto.metaKeyword?.trim() || serviceName;

      return await this.prisma.droneService.create({
        data: {
          ...rest,
          gst: parseFloat(rest.gst as any),
          dgCharges: parseFloat(rest.dgCharges as any),
          service_seo_name: generateSeoName(serviceName),
          // ✅ set meta fields
          metaTitle,
          metaDescription,
          metaKeyword,
          ...(imageUrl && { image: imageUrl }),
          ...(categoryId ? { category: { connect: { id: categoryId } } } : {}),
          ...(industryId ? { industry: { connect: { id: industryId } } } : {}),
        },
      });
    } catch (e) {
      // Prisma unique constraint
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        return this.handleDuplicateError(e.meta?.target);
      }

      // MongoDB raw duplicate key (code 11000)
      if (e?.code === 11000 && e?.keyPattern) {
        const field = Object.keys(e.keyPattern)[0];
        return this.handleDuplicateError(field);
      }

      throw new InternalServerErrorException('Something went wrong');
    }
  }

  async getById(id: string) {
    const obj = await this.prisma.droneService.findUnique({
      where: { id },
      include: {
        categories: {
          select: {
            id: true,
            category: {
              select: {
                id: true,
                category_name: true,
              },
            },
          },
        },
        // properties: true,
        industries: {
          select: {
            id: true,
            industry: {
              select: {
                id: true,
                industry_name: true,
              },
            },
          },
        },
      },
    });
    if (!obj) throw new NotFoundException('Service not found');
    return obj;
  }

  async getByCategoryId(categoryId: string, userId: string) {
    // 1️⃣ Get vendor
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor not found for given userId');
    }

    // 2️⃣ Fetch services via category relation
    const services = await this.prisma.droneService.findMany({
      where: {
        categories: {
          some: {
            categoryId: categoryId,
          },
        },
      },
      include: {
        VendorService: {
          where: {
            vendorId: vendor.id,
          },
          select: {
            id: true,
          },
        },
      },
      orderBy: {
        priorty: 'asc',
      },
    });

    // 3️⃣ Transform response
    return services.map(({ VendorService, ...service }) => ({
      ...service,
      vendorService: VendorService.length > 0, // ✅ true if vendor has this service
    }));
  }

  async update(
    id: string,
    dto: Partial<CreateDroneServiceDto>,
    file?: Express.Multer.File,
  ) {
    try {
      const existing = await this.prisma.droneService.findUnique({
        where: { id },
      });
      if (!existing) throw new NotFoundException('Service not found');

      let imageUrl: string | undefined;
      if (file) {
        imageUrl = file.filename;
      }

      const {
        service_name,
        metaTitle,
        metaDescription,
        metaKeyword,
        priorty,
        ...restDto
      } = dto;

      const finalServiceName = (service_name || existing.service_name)?.trim();

      // ✅ SEO fallback logic
      const finalMetaTitle = metaTitle?.trim() || finalServiceName;

      const finalMetaDescription = metaDescription?.trim() || finalServiceName;

      const finalMetaKeyword = metaKeyword?.trim() || finalServiceName;

      return await this.prisma.droneService.update({
        where: { id },
        data: {
          ...restDto,
          ...(typeof restDto.gst !== 'undefined' && {
            gst: parseFloat(restDto.gst as any),
          }),
          ...(typeof restDto.dgCharges !== 'undefined' && {
            dgCharges: parseFloat(restDto.dgCharges as any),
          }),
          ...(typeof priorty !== 'undefined' && {
            priorty: Number(priorty),
          }),
          ...(service_name && {
            service_name,
            service_seo_name: generateSeoName(service_name),
          }),

          // ✅ meta fields (fallback handled)
          metaTitle: finalMetaTitle,
          metaDescription: finalMetaDescription,
          metaKeyword: finalMetaKeyword,

          ...(imageUrl && { image: imageUrl }),
        },
      });
    } catch (e) {
      console.log(e);

      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException(getFriendlyUniqueMessage(e.meta?.target));
      }

      // raw Mongo duplicate key fallback (code 11000)
      if (e?.code === 11000 && e?.keyPattern) {
        const field = Object.keys(e.keyPattern)[0];
        throw new BadRequestException(getFriendlyUniqueMessage(field));
      }

      throw new InternalServerErrorException('Soemthing Went Wrong');
    }
  }

  async delete(id: string) {
    const obj = await this.prisma.droneService.findUnique({ where: { id } });
    if (!obj) throw new NotFoundException('Service not found');

    return await this.prisma.$transaction(async (prisma) => {
      await prisma.droneServiceCategory.deleteMany({
        where: { serviceId: id },
      });
      await prisma.droneServiceIndustry.deleteMany({
        where: { serviceId: id },
      });
      return prisma.droneService.delete({ where: { id } });
    });
  }

  async getAllServices() {
    const services = await this.prisma.droneService.findMany({
      select: {
        id: true,
        service_name: true,
      },
    });

    if (!services || services.length === 0) {
      throw new NotFoundException('Services Not Found');
    }

    return services;
  }

  // @Pagination(['service_name', 'uav_type', 'unit', 'rate_on_qty', 'description', 'gst', 'feature_needed', 'category.category_name'])
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

      const where: Prisma.DroneServiceWhereInput = {
        ...(dto.search && {
          OR: [
            {
              service_name: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            {
              service_seo_name: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            {
              unit: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            {
              uav_type: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            {
              rate_on_qty: {
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
            {
              feature_needed: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
          ],
        }),
      };

      const [data, total] = await Promise.all([
        this.prisma.droneService.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            createdAt: 'desc',
          },
          include: {
            categories: {
              select: {
                id: true,
                category: {
                  select: {
                    id: true,
                    category_name: true,
                  },
                },
              },
            },
            industries: {
              select: {
                id: true,
                industry: {
                  select: {
                    id: true,
                    industry_name: true,
                  },
                },
              },
            },
          },
        }),
        this.prisma.droneService.count({ where }),
      ]);

      return {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data,
      };
    } catch (error) {
      throw error;
    }
  }

  async getServicesBySeoName(seoName: string) {
    // 1️⃣ Try Category first
    const category = await this.prisma.serviceCategory.findUnique({
      where: { category_seo_name: seoName },
      include: {
        media: true,
        droneServices: {
          include: {
            service: {
              select: {
                id: true,
                service_name: true,
                service_seo_name: true,
                description: true,
                unit: true,
                uav_type: true,
                rate_on_qty: true,
                gst: true,
                dgCharges: true,
                feature_needed: true,
                image: true,
              },
            },
          },
        },
        wcuProperties: {
          select: {
            id: true,
            property: true,
          },
        },
      },
    });

    if (category) {
      return this.mapToUnifiedResponse(category, 'category');
    }

    // 2️⃣ Try Industry
    const industry = await this.prisma.industry.findFirst({
      where: { industry_seo_name: seoName },
      include: {
        media: true,
        droneServices: {
          select: {
            id: true,
            service: {
              select: {
                id: true,
                service_name: true,
                service_seo_name: true,
                description: true,
                unit: true,
                uav_type: true,
                rate_on_qty: true,
                gst: true,
                dgCharges: true,
                feature_needed: true,
                image: true,
              },
            },
          },
        },
        wcuProperties: {
          select: {
            id: true,
            property: true,
          },
        },
      },
    });

    if (industry) {
      return this.mapToUnifiedResponse(industry, 'industry');
    }

    // 3️⃣ Nothing found
    throw new NotFoundException('No category or industry found');
  }

  private mapToUnifiedResponse(source: any, type: 'category' | 'industry') {
    return {
      id: source.id,

      name: type === 'category' ? source.category_name : source.industry_name,

      seo_name:
        type === 'category'
          ? source.category_seo_name
          : source.industry_seo_name,

      type, // optional but useful
      description:
        type === 'category' ? source.description : source.description,

      media: source.media || [],

      services:
        source.droneServices?.map((ds) => ({
          id: ds.id,
          serviceId: ds.service.id,
          service_name: ds.service.service_name,
          service_seo_name: ds.service.service_seo_name,
          description: ds.service.description,
          unit: ds.service.unit,
          uav_type: ds.service.uav_type,
          rate_on_qty: ds.service.rate_on_qty,
          gst: ds.service.gst,
          dgCharges: ds.service.dgCharges,
          feature_needed: ds.service.feature_needed,
          image: ds.service.image,
        })) || [],

      wcuProperties:
        source.wcuProperties?.map((wcu) => ({
          id: wcu.id,
          property:
            type === 'category'
              ? wcu.property.propHeading
              : wcu.property.propHeading,
          description:
            type === 'category'
              ? wcu.property.propDescription
              : wcu.property.propDescription,
          image:
            type === 'category'
              ? wcu.property.propImage
              : wcu.property.propImage,
          priorty:
            type === 'category'
              ? wcu.property.propPriorty
              : wcu.property.propPriorty,
        })) || [],
    };
  }
}
