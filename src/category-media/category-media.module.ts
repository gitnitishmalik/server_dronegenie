import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { CategoryMediaController } from './category-media.controller';
import { CategoryMediaService } from './category-media.service';

@Module({
  imports: [PrismaModule],
  controllers: [CategoryMediaController],
  providers: [CategoryMediaService],
})
export class CategoryMediaModule {}
