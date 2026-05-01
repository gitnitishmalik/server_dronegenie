import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  CreateServiceCategoryDto,
  UpdateCategoryPropertiesDto,
  UpdateCategoryServicesDto,
} from './dto/create-service-category.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import { generateSeoName } from 'src/common/utils/seo.util';
import * as XLSX from 'xlsx';
import { CategoryStatus } from 'src/common/enums';
import { Prisma } from '@prisma/client';

@Injectable()
export class ServiceCategoryService {
  constructor(private readonly prisma: PrismaService) {}

  async importFromExcel(file: Express.Multer.File) {
    if (!file) throw new ConflictException('No file provided');

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    const categories = data.map((row: any) => ({
      category_name: row['Category Name'],
      category_seo_name: generateSeoName(row['Category Name']),
      priorty: parseInt(row['Priority'] || 1),
      description: row['Description'] || '',
    }));

    // Use transaction to insert
    const result = await this.prisma.$transaction(
      categories.map((cat) =>
        this.prisma.serviceCategory.create({
          data: cat,
        }),
      ),
    );

    return { message: 'Categories imported', count: result.length };
  }

  async create(createServiceCategoryDto: CreateServiceCategoryDto) {
    try {
      // let imageUrl: string | undefined;
      // if (file) {
      //   imageUrl = file.filename
      // }

      const {
        category_name,
        shortDesc,
        status,
        metaTitle,
        metaDescription,
        metaKeyword,
        ...rest
      } = createServiceCategoryDto;

      const categoryName = category_name?.trim();

      // ✅ SEO fallback
      const finalMetaTitle = metaTitle?.trim() || categoryName;

      const finalMetaDescription = metaDescription?.trim() || categoryName;

      const finalMetaKeyword = metaKeyword?.trim() || categoryName;

      return await this.prisma.serviceCategory.create({
        data: {
          ...rest,
          category_name,
          shortDesc,
          status: status || CategoryStatus.ACTIVE,
          category_seo_name: generateSeoName(category_name),

          // ✅ meta fields
          metaTitle: finalMetaTitle,
          metaDescription: finalMetaDescription,
          metaKeyword: finalMetaKeyword,

          // ...(imageUrl && { image: imageUrl }),
        },
      });
    } catch (error) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          'Category with provided unique fields already exists',
        );
      }
      throw error;
    }
  }

  // @Pagination([
  //   'category_name',
  //   'category_seo_name',
  //   'priorty',
  //   'description',
  //   'createdAt',
  //   'updatedAt',
  // ])
  // async findAll(
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

  async findAll(dto: PaginationDto) {
    try {
      const page = dto.page ? parseInt(dto.page) : 1;
      const limit = dto.limit ? parseInt(dto.limit) : 10;
      const skip = (page - 1) * limit;

      const where: Prisma.ServiceCategoryWhereInput = {
        ...(dto.search && {
          OR: [
            {
              category_name: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            {
              category_seo_name: {
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
              shortDesc: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            {
              status: {
                equals:
                  dto.search.toUpperCase() === 'ACTIVE'
                    ? 'ACTIVE'
                    : dto.search.toUpperCase() === 'INACTIVE'
                      ? 'INACTIVE'
                      : undefined,
              },
            },
          ],
        }),
      };

      const [data, total] = await Promise.all([
        this.prisma.serviceCategory.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            priorty: 'asc',
          },
          include: {
            media: true,
            droneServices: {
              select: {
                id: true,
                service: {
                  select: {
                    id: true,
                    service_name: true,
                  },
                },
              },
            },
          },
        }),
        this.prisma.serviceCategory.count({ where }),
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

  async getForBrowse(dto: PaginationDto) {
    try {
      const page = dto.page ? parseInt(dto.page) : 1;
      const limit = dto.limit ? parseInt(dto.limit) : 10;
      const skip = (page - 1) * limit;

      const where: Prisma.ServiceCategoryWhereInput = {
        status: 'ACTIVE',
        ...(dto.search && {
          OR: [
            {
              category_name: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            {
              category_seo_name: {
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
              shortDesc: {
                contains: dto.search,
                mode: 'insensitive',
              },
            },
            {
              status: {
                equals:
                  dto.search.toUpperCase() === 'ACTIVE'
                    ? 'ACTIVE'
                    : dto.search.toUpperCase() === 'INACTIVE'
                      ? 'INACTIVE'
                      : undefined,
              },
            },
          ],
        }),
      };

      const [data, total] = await Promise.all([
        this.prisma.serviceCategory.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            priorty: 'asc',
          },
          include: {
            media: true,
            droneServices: {
              select: {
                id: true,
                service: {
                  select: {
                    id: true,
                    service_name: true,
                  },
                },
              },
            },
          },
        }),
        this.prisma.serviceCategory.count({ where }),
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

  async findOne(id: string) {
    const obj = await this.prisma.serviceCategory.findUnique({
      where: { id },
      include: {
        media: true,
        droneServices: {
          include: {
            service: {
              select: {
                id: true,
                service_name: true,
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
    if (!obj) throw new NotFoundException('Category not found');
    return obj;
  }

  async update(
    id: string,
    updateServiceCategoryDto: Partial<CreateServiceCategoryDto>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    file?: Express.Multer.File,
  ) {
    const obj = await this.prisma.serviceCategory.findUnique({
      where: { id },
    });
    if (!obj) throw new NotFoundException('Category not found');

    // let imageUrl: string | undefined;
    // if (file) {
    //   imageUrl = file.filename
    // }

    const {
      category_name,
      priorty,
      metaTitle,
      metaDescription,
      metaKeyword,
      ...rest
    } = updateServiceCategoryDto;

    // ✅ final category name (new OR existing)
    const finalCategoryName = (category_name || obj.category_name)?.trim();

    // ✅ SEO fallback
    const finalMetaTitle = metaTitle?.trim() || finalCategoryName;

    const finalMetaDescription = metaDescription?.trim() || finalCategoryName;

    const finalMetaKeyword = metaKeyword?.trim() || finalCategoryName;

    return this.prisma.serviceCategory.update({
      where: { id },
      data: {
        ...rest,
        // ✅ meta fields
        metaTitle: finalMetaTitle,
        metaDescription: finalMetaDescription,
        metaKeyword: finalMetaKeyword,

        ...(category_name && {
          category_name,
          category_seo_name: generateSeoName(category_name),
        }),
        ...(typeof priorty !== 'undefined' && {
          priorty: Number(priorty),
        }),
        // ...(imageUrl && { image: imageUrl }),
      },
    });
  }

  async remove(id: string) {
    const category = await this.prisma.serviceCategory.findUnique({
      where: { id },
    });
    if (!category) throw new NotFoundException('Category not found');

    const count = await this.prisma.droneService.count({
      where: { categoryId: id },
    });

    if (count > 0) {
      throw new BadRequestException(
        'Category cannot be deleted because it has associated services',
      );
    }

    await this.prisma.serviceCategory.delete({ where: { id } });
    return { message: 'Category deleted' };
  }

  async findBySeoName(seoName: string) {
    console.log(seoName);

    const obj = await this.prisma.serviceCategory.findUnique({
      where: { category_seo_name: seoName },
      include: {
        media: true,
        droneServices: {
          include: {
            service: {
              select: {
                id: true,
                service_name: true,
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
    if (!obj) throw new NotFoundException('Category not found');
    return obj;
  }

  async updateCategoryServices(dto: UpdateCategoryServicesDto) {
    const { categoryId, addServiceIds = [], removeServiceIds = [] } = dto;

    if (!addServiceIds.length && !removeServiceIds.length) {
      throw new BadRequestException(
        'Nothing to update: addServiceIds or removeServiceIds required',
      );
    }

    // ensure category exists
    const category = await this.prisma.serviceCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException('Service category not found');
    }

    const txOps: Prisma.PrismaPromise<any>[] = [];

    // ADD relations (skipDuplicates avoids error if already exists)
    if (addServiceIds.length) {
      txOps.push(
        this.prisma.droneServiceCategory.createMany({
          data: addServiceIds.map((serviceId) => ({
            categoryId,
            serviceId,
          })),
          // skipDuplicates: true,
        }),
      );
    }

    // REMOVE relations
    if (removeServiceIds.length) {
      txOps.push(
        this.prisma.droneServiceCategory.deleteMany({
          where: {
            categoryId,
            serviceId: { in: removeServiceIds },
          },
        }),
      );
    }

    await this.prisma.$transaction(txOps);

    // return updated category with its services
    return this.prisma.serviceCategory.findUnique({
      where: { id: categoryId },
      include: {
        droneServices: {
          include: {
            service: true, // DroneService
          },
        },
      },
    });
  }

  async updateCategoryProperties(dto: UpdateCategoryPropertiesDto) {
    const { categoryId, addPropertyIds = [], removePropertyIds = [] } = dto;

    if (!addPropertyIds.length && !removePropertyIds.length) {
      throw new BadRequestException(
        'Nothing to update: addPropertyIds or removePropertyIds required',
      );
    }

    // ensure category exists
    const category = await this.prisma.serviceCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException('Service category not found');
    }

    const txOps: Prisma.PrismaPromise<any>[] = [];

    // ADD relations
    if (addPropertyIds.length) {
      txOps.push(
        this.prisma.wCUPropertiesCategory.createMany({
          data: addPropertyIds.map((propertyId) => ({
            categoryId,
            propertyId,
          })),
          // skipDuplicates: true, // optional - enable if supported in your setup
        }),
      );
    }

    // REMOVE relations
    if (removePropertyIds.length) {
      txOps.push(
        this.prisma.wCUPropertiesCategory.deleteMany({
          where: {
            categoryId,
            propertyId: { in: removePropertyIds },
          },
        }),
      );
    }

    await this.prisma.$transaction(txOps);

    // return updated category with its properties
    return this.prisma.serviceCategory.findUnique({
      where: { id: categoryId },
      include: {
        wcuProperties: {
          include: {
            property: true, // Prisma will generate this field name if relation is set like your model
          },
        },
      },
    });
  }

  async getCategoryServices(categoryId: string, dto: PaginationDto) {
    try {
      // 1. Ensure category exists
      const category = await this.prisma.serviceCategory.findUnique({
        where: { id: categoryId },
        select: { id: true },
      });

      if (!category) {
        throw new NotFoundException('Category not found');
      }

      // 2. Pagination + search
      const { limit = '10', page = '1', search } = dto;

      const take = Math.max(Number(limit) || 10, 1);
      const pageNumber = Math.max(Number(page) || 1, 1);
      const skip = (pageNumber - 1) * take;

      // 3. Build where for DroneService
      const where: Prisma.DroneServiceWhereInput = {
        categories: {
          some: {
            categoryId,
          },
        },
      };

      if (search && search.trim() !== '') {
        where.service_name = {
          contains: search.trim(),
          mode: 'insensitive',
        };
      }

      // 4. Count + fetch
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
        message: 'Category services retrieved successfully',
        data: {
          total,
          page: pageNumber,
          limit: take,
          totalPages: Math.ceil(total / take),
          services,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Internal server error');
    }
  }

  async getCategoryProperties(categoryId: string, dto: PaginationDto) {
    try {
      // 1. Ensure category exists
      const category = await this.prisma.serviceCategory.findUnique({
        where: { id: categoryId },
        select: { id: true },
      });

      if (!category) {
        throw new NotFoundException('Category not found');
      }

      // 2. Pagination + search
      const { limit = '10', page = '1', search } = dto;

      const take = Math.max(Number(limit) || 10, 1);
      const pageNumber = Math.max(Number(page) || 1, 1);
      const skip = (pageNumber - 1) * take;

      // 3. Build where for WCUProperties
      const where: Prisma.WCUPropertiesWhereInput = {
        categories: {
          some: {
            categoryId,
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

      // 4. Count + fetch
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
        message: 'Category properties retrieved successfully',
        data: {
          total,
          page: pageNumber,
          limit: take,
          totalPages: Math.ceil(total / take),
          properties,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Internal server error');
    }
  }
}
