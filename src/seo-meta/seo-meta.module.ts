import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { SeoMetaController } from './seo-meta.controller';
import { SeoMetaService } from './seo-meta.service';

@Module({
  imports: [PrismaModule],
  controllers: [SeoMetaController],
  providers: [SeoMetaService],
})
export class SeoMetaModule {}
