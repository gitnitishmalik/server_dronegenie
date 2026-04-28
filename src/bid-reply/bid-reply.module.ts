import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { BidReplyController } from './bid-reply.controller';
import { BidReplyService } from './bid-reply.service';

@Module({
  imports: [PrismaModule],
  controllers: [BidReplyController],
  providers: [BidReplyService],
})
export class BidReplyModule {}
