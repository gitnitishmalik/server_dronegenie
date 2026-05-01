import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { RequestCallbackController } from './request-callback.controller';
import { RequestCallbackService } from './request-callback.service';

@Module({
  imports: [PrismaModule],
  controllers: [RequestCallbackController],
  providers: [RequestCallbackService],
})
export class RequestCallbackModule {}
