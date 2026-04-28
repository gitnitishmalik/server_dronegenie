import { BadRequestException, HttpException, Injectable, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { CategoryMediaDto } from "./dtos/category-media.dto";
import { url } from "inspector";
import { deleteFileIfExists } from "src/common/utils/file.util";

@Injectable({})
export class CategoryMediaService {
    constructor(private readonly prisma: PrismaService) { }

    async create(dto: CategoryMediaDto, file: Express.Multer.File) {
        try {
            console.log("Entry Create");
            
            if (!file) {
                throw new BadRequestException("Media file is required");
            }
            const mediaUrl = file.filename;

            const media = await this.prisma.categoryMedia.create({
                data: {
                    // connect the required relation to ServiceCategory
                    category: { connect: { id: dto.categoryId } },
                    type: dto.type,
                    size: dto.size,
                    url: mediaUrl,
                },
            });

            return {
                message: "Category media created successfully",
                data: media,
            };
        } catch (error) {
            console.log(error);
            
            if (error instanceof HttpException) throw error;
            throw new InternalServerErrorException("Internal server error");
        }
    }

    async getAll(categoryId: string) {
        try {
            // no where: {} — just call findMany()
            const medias = await this.prisma.categoryMedia.findMany({
                where: {categoryId}
            });

            if(!categoryId) throw new NotFoundException("Category not found")

            return {
                message: "Category media retrieved successfully",
                data: medias,
            };
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw new InternalServerErrorException("Internal server error");
        }
    }

    async get(id: string) {
        try {
            const media = await this.prisma.categoryMedia.findUnique({
                where: { id },
            });

            if (!media) throw new NotFoundException("Media not found");

            return {
                message: "Category media retrieved successfully",
                data: media,
            };
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw new InternalServerErrorException("Internal server error");
        }
    }

    async delete(id: string) {
        try {
            const media = await this.prisma.categoryMedia.findUnique({
                where: { id },
            });
            if (!media) throw new NotFoundException("Media not found");

            await this.prisma.categoryMedia.delete({
                where: { id },
            });

            await deleteFileIfExists(media.url);

            return {
                message: "Category media deleted successfully",
            };
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw new InternalServerErrorException("Internal server error");
        }
    }

    async update(id: string, dto: Partial<CategoryMediaDto>, file?: Express.Multer.File) {
        try {
            // If you require a file on update, keep `file` non-optional and throw if missing.
            const updateData: any = {};
            if (dto.type) updateData.type = dto.type;
            if (dto.size) updateData.size = dto.size;

            if (file) {
                updateData.url = file.filename;
            }

            const media = await this.prisma.categoryMedia.update({
                where: { id },
                data: updateData,
            });

            return {
                message: "Category media updated successfully",
                data: media,
            };
        } catch (error) {
            if (error instanceof HttpException) throw error;
            // If update fails because record not found, Prisma will throw — you could catch and translate to NotFoundException if you want.
            throw new InternalServerErrorException("Internal server error");
        }
    }
}