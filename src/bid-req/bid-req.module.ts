import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { BidRequestService } from './bid-req.service';
import { BidRequestController } from './bid-req.controller';

@Module({
  imports: [PrismaModule],
  providers: [BidRequestService],
  controllers: [BidRequestController],
})
export class BidRequestModule {}
