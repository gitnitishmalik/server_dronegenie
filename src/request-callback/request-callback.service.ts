import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { RequestCallbackDto } from "./dtos/request-callback.dto";
import { PaginationDto } from "src/common/dto";
import { Prisma } from "@prisma/client";

@Injectable({})
export class RequestCallbackService {
    constructor(private readonly prisma: PrismaService) { }

    async request(dto: RequestCallbackDto) {
        try {
            const request = await this.prisma.requestCallback.create({
                data: {
                    ...dto
                }
            })

            return request;
        } catch (error) {
            throw error;
        }
    }


    async getAll(dto: PaginationDto) {
        try {
            const page = dto.page ? Number(dto.page) : 1;
            const limit = dto.limit ? Number(dto.limit) : 10;
            const skip = (page - 1) * limit;

            const search = dto.search?.trim();

            let where: Prisma.RequestCallbackWhereInput = {};

            if (search) {
                where = {
                    OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { email: { contains: search, mode: 'insensitive' } },
                        { phone: { contains: search, mode: 'insensitive' } },
                        { message: { contains: search, mode: 'insensitive' } },
                    ],
                };
            }

            const [data, total] = await Promise.all([
                this.prisma.requestCallback.findMany({
                    where,
                    skip,
                    take: limit,
                    orderBy: {
                        createdAt: 'desc',
                    },
                }),
                this.prisma.requestCallback.count({ where }),
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