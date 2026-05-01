import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PaymentModule } from 'src/payment/payment.module';
import { InvoiceModule } from 'src/invoice/invoice.module';
import { MailModule } from 'src/mail/mail.module';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

@Module({
  imports: [PrismaModule, PaymentModule, InvoiceModule, MailModule],
  controllers: [OrderController],
  providers: [OrderService],
})
export class OrderModule {}
