import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateSettingDto, UpdateSettingDto } from './dtos/setting.dto';

@Injectable()
export class SettingService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSettingDto, files: Express.Multer.File[]) {
    let logoUrl: string | undefined;
    let bannerUrl: string | undefined;

    for (const file of files) {
      if (file.fieldname === 'logo') {
        logoUrl = file.filename;
      } else if (file.fieldname === 'bannerImg') {
        bannerUrl = file.filename;
      }
    }

    return this.prisma.setting.create({
      data: {
        logo: logoUrl || dto.logo,
        bannerImg: bannerUrl || dto.bannerImg,
      },
    });
  }

  async findAll() {
    return this.prisma.setting.findMany();
  }

  async findById(id: string) {
    const setting = await this.prisma.setting.findUnique({
      where: { id },
    });

    if (!setting) throw new NotFoundException('Setting not found');

    return setting;
  }

  async update(
    id: string,
    dto: UpdateSettingDto,
    files: Express.Multer.File[],
  ) {
    const setting = await this.prisma.setting.findUnique({ where: { id } });
    if (!setting) throw new NotFoundException('Setting not found');

    let logoUrl: string | undefined;
    let bannerUrl: string | undefined;

    for (const file of files) {
      if (file.fieldname === 'logo') {
        logoUrl = file.filename;
      } else if (file.fieldname === 'bannerImg') {
        bannerUrl = file.filename;
      }
    }

    return this.prisma.setting.update({
      where: { id },
      data: {
        ...(logoUrl && { logo: logoUrl }),
        ...(bannerUrl && { bannerImg: bannerUrl }),
      },
    });
  }

  async delete(id: string) {
    const existingSetting = await this.prisma.setting.findUnique({
      where: { id },
    });

    if (!existingSetting) throw new NotFoundException('Setting not found');

    return this.prisma.setting.delete({
      where: { id },
    });
  }
}
