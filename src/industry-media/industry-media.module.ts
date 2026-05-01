import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { IndustryMediaController } from './industry-media.controller';
import { IndustryMediaService } from './industry-media.service';

@Module({
  imports: [PrismaModule],
  controllers: [IndustryMediaController],
  providers: [IndustryMediaService],
})
export class IndustryMediaModule {}
