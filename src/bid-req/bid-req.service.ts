import { Injectable, NotFoundException } from "@nestjs/common";
import { CreateBidRequestDto } from "./dtos";
import { PrismaService } from "src/prisma/prisma.service";
import { Pagination } from "src/common/decorators/pagination.decorator";
import { PaginationDto } from "src/common/dto";
import { BidStatus } from "src/common/enums";
import { Prisma } from "@prisma/client";

@Injectable({})
export class BidRequestService {
    constructor(
        private readonly prisma: PrismaService,
    ) { }

    async createBidRequest(dto: CreateBidRequestDto, userId: string, files: Express.Multer.File[]) {
        const customer = await this.prisma.customer.findUnique({
            where: { userId }
        })

        if (!customer) {
            throw new NotFoundException("Customer Not Found");
        }

        const mediaPaths = await Promise.all(
            files.map(file => file.filename)
        );

        return this.prisma.bidRequest.create({
            data: {
                customerId: customer.id,
                serviceId: dto.serviceId,
                description: dto.description,
                startDate: new Date(dto.startDate),
                endDate: new Date(dto.endDate),
                area: dto.area,
                unit: dto.unit,
                location: dto.location,
                media: mediaPaths,
                status: BidStatus.PENDING
            }
        })
    }

    // @Pagination([])
    // async getBidRequest(
    //     dto: PaginationDto,
    //     modelName: string,
    //     queryOptions: any
    // ): Promise<{
    //     total: number;
    //     page: number;
    //     limit: number;
    //     data: any[];
    // }> {
    //     return {
    //         total: 0,
    //         page: 0,
    //         limit: 0,
    //         data: [],
    //     };
    // }

    async getBidRequest(dto: PaginationDto, vendorId: string) {
        try {
            const page = dto.page ? parseInt(dto.page) : 1;
            const limit = dto.limit ? parseInt(dto.limit) : 10;
            const skip = (page - 1) * limit;

            // 1️⃣ Get vendor service IDs
            const services = await this.prisma.vendorService.findMany({
                where: { vendorId },
                select: { serviceId: true },
            });

            if (!services || services.length === 0) {
                throw new NotFoundException('Bid-requests not found');
            }

            const vendorServiceIds = services.map(s => s.serviceId);

            let searchServiceIds: string[] = [];
            let searchCustomerIds: string[] = [];

            if (dto.search) {
                // 🔹 services by name
                const matchedServices = await this.prisma.droneService.findMany({
                    where: {
                        service_name: {
                            contains: dto.search,
                            mode: 'insensitive',
                        },
                    },
                    select: { id: true },
                });

                searchServiceIds = matchedServices.map(s => s.id);

                // 🔹 customers by name / representative
                const matchedCustomers = await this.prisma.customer.findMany({
                    where: {
                        OR: [
                            {
                                representative: {
                                    contains: dto.search,
                                    mode: 'insensitive',
                                },
                            },
                            {
                                user: {
                                    name: {
                                        contains: dto.search,
                                        mode: 'insensitive',
                                    },
                                },
                            },
                        ],
                    },
                    select: { id: true },
                });

                searchCustomerIds = matchedCustomers.map(c => c.id);
            }


            // 2️⃣ Build where condition
            const where: Prisma.BidRequestWhereInput = {
                serviceId: {
                    in: vendorServiceIds,
                },
                status: BidStatus.PENDING,

                ...(dto.search && {
                    OR: [
                        {
                            description: {
                                contains: dto.search,
                                mode: 'insensitive',
                            },
                        },
                        {
                            location: {
                                contains: dto.search,
                                mode: 'insensitive',
                            },
                        },
                        ...(searchServiceIds.length
                            ? [
                                {
                                    serviceId: {
                                        in: searchServiceIds,
                                    },
                                },
                            ]
                            : []),
                        ...(searchCustomerIds.length
                            ? [
                                {
                                    customerId: {
                                        in: searchCustomerIds,
                                    },
                                },
                            ]
                            : []),
                    ],
                }),
            };


            // 3️⃣ Fetch data + count
            const data = await this.prisma.bidRequest.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    customer: {
                        select: {
                            representative: true,
                        },
                    },
                    service: {
                        select: {
                            service_name: true,
                        },
                    },
                },
            });

            const total = dto.search
                ? (
                    await this.prisma.bidRequest.findMany({
                        where,
                        select: { id: true },
                    })
                ).length
                : await this.prisma.bidRequest.count({ where });


            return {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                data
            };
        } catch (error) {
            throw error;
        }
    }


    // @Pagination(['description', 'startDate', 'endDate', 'areaUnit'])
    // async getBidRequestForCustomer(
    //     dto: PaginationDto,
    //     modelName: string,
    //     queryOptions: any
    // ): Promise<{
    //     total: number;
    //     page: number;
    //     limit: number;
    //     data: any[];
    // }> {
    //     return {
    //         total: 0,
    //         page: 0,
    //         limit: 0,
    //         data: [],
    //     };
    // }
    async getBidRequestForCustomer(dto: PaginationDto, customerId: string) {
        try {
            const page = dto.page ? parseInt(dto.page) : 1;
            const limit = dto.limit ? parseInt(dto.limit) : 10;
            const skip = (page - 1) * limit;

            const where: Prisma.BidRequestWhereInput = {
                customerId,
                ...(dto.search && {
                    OR: [
                        {
                            description: {
                                contains: dto.search,
                                mode: 'insensitive',
                            },
                        },
                        {
                            location: {
                                contains: dto.search,
                                mode: 'insensitive',
                            },
                        },
                        {
                            service: {
                                service_name: {
                                    contains: dto.search,
                                    mode: 'insensitive',
                                },
                            },
                        },
                    ],
                }),
            }

            const [data, total] = await Promise.all([
                this.prisma.bidRequest.findMany({
                    where,
                    skip,
                    take: limit,
                    orderBy: {
                        createdAt: 'desc',
                    },
                    include: {
                        service: true,
                        bidReply: true
                    },
                }),
                this.prisma.bidRequest.count({ where }),
            ]);

            return {
                page,
                limit,
                total,
                data
            }
        } catch (error) {
            throw error;
        }
    }


    // @Pagination(['description', 'startDate', 'endDate', 'areaUnit'])
    // async getBidRequestForHomePage(
    //     dto: PaginationDto,
    //     modelName: string,
    //     queryOptions: any
    // ): Promise<{
    //     total: number;
    //     page: number;
    //     limit: number;
    //     data: any[];
    // }> {
    //     return {
    //         total: 0,
    //         page: 0,
    //         limit: 0,
    //         data: [],
    //     };
    // }

    async getBidRequestForHomePage(dto: PaginationDto, customerId: string) {
        try {
            const page = dto.page ? parseInt(dto.page) : 1;
            const limit = dto.limit ? parseInt(dto.limit) : 10;
            const skip = (page - 1) * limit;

            const where: Prisma.BidRequestWhereInput = {
                customerId,
                ...(dto.search && {
                    OR: [
                        {
                            description: {
                                contains: dto.search,
                                mode: 'insensitive',
                            },
                        },
                        {
                            location: {
                                contains: dto.search,
                                mode: 'insensitive',
                            },
                        },
                        {
                            service: {
                                service_name: {
                                    contains: dto.search,
                                    mode: 'insensitive',
                                },
                            },
                        },
                    ],
                }),
            }

            const [data, total] = await Promise.all([
                this.prisma.bidRequest.findMany({
                    where,
                    skip,
                    take: limit,
                    orderBy: {
                        createdAt: 'desc',
                    },
                    include: {
                        service: true,
                        bidReply: true
                    }
                }),
                this.prisma.bidRequest.count({ where }),
            ]);

            return {
                page,
                limit,
                total,
                data
            }
        } catch (error) {
            throw error;
        }
    }


    // @Pagination(['description', 'startDate', 'endDate', 'areaUnit'])
    // async getAll(
    //     dto: PaginationDto,
    //     modelName: string,
    //     queryOptions: any
    // ): Promise<{
    //     total: number;
    //     page: number;
    //     limit: number;
    //     data: any[];
    // }> {
    //     return {
    //         total: 0,
    //         page: 0,
    //         limit: 0,
    //         data: [],
    //     };
    // }

    async getAll(dto: PaginationDto) {
        try {
            const page = dto.page ? parseInt(dto.page) : 1;
            const limit = dto.limit ? parseInt(dto.limit) : 10;
            const skip = (page - 1) * limit;

            const where: Prisma.BidRequestWhereInput = {
                ...(dto.search && {
                    OR: [
                        {
                            description: {
                                contains: dto.search,
                                mode: 'insensitive',
                            },
                        },
                        {
                            location: {
                                contains: dto.search,
                                mode: 'insensitive',
                            },
                        },
                        {
                            service: {
                                service_name: {
                                    contains: dto.search,
                                    mode: 'insensitive',
                                },
                            },
                        },
                        {
                            customer: {
                                user: {
                                    name: {
                                        contains: dto.search,
                                        mode: 'insensitive',
                                    },
                                },
                            },
                        },
                        {
                            bidReply: {
                                some: {
                                    vendor: {
                                        user: {
                                            name: {
                                                contains: dto.search,
                                                mode: 'insensitive',
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    ],
                }),
            };

            const [data, total] = await Promise.all([
                this.prisma.bidRequest.findMany({
                    where,
                    skip,
                    take: limit,
                    orderBy: {
                        createdAt: 'desc',
                    },
                    include: {
                        customer: true,
                        service: true,
                        bidReply: true
                    }
                }),
                this.prisma.bidRequest.count({ where }),
            ]);

            return {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                data
            };
        } catch (error) {
            throw error;
        }
    }
}