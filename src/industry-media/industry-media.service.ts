import { BadRequestException, HttpException, Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { IndustryMediaDto } from "./dtos/industry-media.dto";
import { url } from "inspector";
import { deleteFileIfExists } from "src/common/utils/file.util";

@Injectable({})
export class IndustryMediaService {
    constructor(private readonly prisma: PrismaService) { }

    async create(dto: IndustryMediaDto, file: Express.Multer.File) {
        try {
            if (!file) {
                throw new BadRequestException("Media file is required");
            }
            const mediaUrl = file.filename;

            const media = await this.prisma.industryMedia.create({
                data: {
                    // connect the required relation to ServiceCategory
                    industry: { connect: { id: dto.industryId } },
                    type: dto.type,
                    size: dto.size,
                    url: mediaUrl,
                },
            });

            return {
                message: "Industry media created successfully",
                data: media,
            };
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw new InternalServerErrorException("Internal server error");
        }
    }

    async getAll(industryId: string) {
        try {
            // no where: {} — just call findMany()
            const medias = await this.prisma.industryMedia.findMany({
                where: {industryId}
            });

            if(!medias) throw new NotFoundException("Industry media not found")

            return {
                message: "Industry media retrieved successfully",
                data: medias,
            };
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw new InternalServerErrorException("Internal server error");
        }
    }

    async get(id: string) {
        try {
            const media = await this.prisma.industryMedia.findUnique({
                where: { id },
            });

            if (!media) throw new NotFoundException("Media not found");

            return {
                message: "Industry media retrieved successfully",
                data: media,
            };
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw new InternalServerErrorException("Internal server error");
        }
    }

    async delete(id: string) {
        try {
            const media = await this.prisma.industryMedia.findUnique({
                where: { id },
            });
            if (!media) throw new NotFoundException("Media not found");

            await this.prisma.industryMedia.delete({
                where: { id },
            });

            await deleteFileIfExists(media.url);

            return {
                message: "Industry media deleted successfully",
            };
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw new InternalServerErrorException("Internal server error");
        }
    }

    async update(id: string, dto: Partial<IndustryMediaDto>, file?: Express.Multer.File) {
        try {
            // If you require a file on update, keep `file` non-optional and throw if missing.
            const updateData: any = {};
            if (dto.type) updateData.type = dto.type;
            if (dto.size) updateData.size = dto.size;

            if (file) {
                updateData.url = file.filename;
            }

            const media = await this.prisma.industryMedia.update({
                where: { id },
                data: updateData,
            });

            return {
                message: "Industry media updated successfully",
                data: media,
            };
        } catch (error) {
            if (error instanceof HttpException) throw error;
            // If update fails because record not found, Prisma will throw — you could catch and translate to NotFoundException if you want.
            throw new InternalServerErrorException("Internal server error");
        }
    }
}