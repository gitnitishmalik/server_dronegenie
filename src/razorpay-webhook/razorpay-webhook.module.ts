import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { RazorpayWebhookController } from './razorpay-webhook.controller';
import { RazorpayWebhookService } from './razorpay-webhook.service';

@Module({
  imports: [PrismaModule],
  controllers: [RazorpayWebhookController],
  providers: [RazorpayWebhookService],
})
export class RazorpayWebhookModule {}
