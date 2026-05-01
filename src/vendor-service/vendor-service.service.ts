import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Pagination } from 'src/common/decorators/pagination.decorator';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class VendorServiceService {
  constructor(private readonly prisma: PrismaService) {}

  async addServicesToVendor(id: string, serviceIds: string[]) {
    if (!serviceIds || serviceIds.length === 0) {
      throw new BadRequestException('At least one service ID is required');
    }

    const vendor = await this.prisma.vendor.findUnique({
      where: { userId: id },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor Not Found');
    }

    const existingVendorServices = await this.prisma.vendorService.findMany({
      where: {
        vendorId: vendor.id,
        serviceId: { in: serviceIds },
      },
    });

    const existingServiceIds = existingVendorServices.map((vs) => vs.serviceId);
    const newServiceIds = serviceIds.filter(
      (id) => !existingServiceIds.includes(id),
    );

    if (newServiceIds.length === 0) {
      throw new ConflictException(
        'All selected services are already associated with this vendor',
      );
    }

    const vendorServicesData = newServiceIds.map((serviceId) => ({
      vendorId: vendor.id,
      serviceId,
    }));

    const createdVendorServices = await this.prisma.vendorService.createMany({
      data: vendorServicesData,
    });

    return createdVendorServices;
  }

  @Pagination(['vendorId', 'serviceId'])
  async getAll(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    dto?: any,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    modelName?: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    queryOptions?: any,
  ): Promise<{
    total: number;
    page: number;
    limit: number;
    data: any[];
  }> {
    return {
      total: 0,
      page: 0,
      limit: 0,
      data: [],
    };
  }

  async updateVendorServices(userId: string, serviceIds: string[]) {
    console.log(serviceIds);

    if (!serviceIds || serviceIds.length === 0) {
      throw new BadRequestException('At least one service ID is required');
    }

    // 1️⃣ Find vendor
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');

    // 2️⃣ Fetch current services
    const currentServices = await this.prisma.vendorService.findMany({
      where: { vendorId: vendor.id },
      select: { serviceId: true },
    });

    const currentServiceIds = new Set(currentServices.map((s) => s.serviceId));
    const incomingServiceIds = new Set(serviceIds);

    // 3️⃣ Services to DELETE (exist in DB but not in request)
    const serviceIdsToDelete = [...currentServiceIds].filter(
      (id) => !incomingServiceIds.has(id),
    );

    // 4️⃣ Services to ADD (exist in request but not in DB)
    const serviceIdsToAdd = serviceIds.filter(
      (id) => !currentServiceIds.has(id),
    );

    // 5️⃣ Validate services to add
    const validServices = await this.prisma.droneService.findMany({
      where: { id: { in: serviceIdsToAdd } },
      select: { id: true },
    });

    const validServiceIds = validServices.map((s) => s.id);
    const invalidIds = serviceIdsToAdd.filter(
      (id) => !validServiceIds.includes(id),
    );

    const vendorServicesToCreate = validServiceIds.map((serviceId) => ({
      vendorId: vendor.id,
      serviceId,
    }));

    // 6️⃣ Transaction: delete + create
    await this.prisma.$transaction(async (tx) => {
      if (serviceIdsToDelete.length > 0) {
        await tx.vendorService.deleteMany({
          where: {
            vendorId: vendor.id,
            serviceId: { in: serviceIdsToDelete },
          },
        });
      }

      if (vendorServicesToCreate.length > 0) {
        await tx.vendorService.createMany({
          data: vendorServicesToCreate,
          // skipDuplicates: true,
        });
      }
    });

    // 7️⃣ Response
    const response: any = { message: 'Vendor services synced successfully' };

    if (invalidIds.length > 0) {
      response.warning = `Invalid serviceIds skipped: ${invalidIds.join(', ')}`;
    }

    return response;
  }
}
