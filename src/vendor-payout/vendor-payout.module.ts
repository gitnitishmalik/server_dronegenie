import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PaymentModule } from 'src/payment/payment.module';
import { VendorPayoutController } from './vendor-payout.controller';
import { VendorPayoutService } from './vendor-payout.service';

@Module({
  imports: [PrismaModule, PaymentModule],
  controllers: [VendorPayoutController],
  providers: [VendorPayoutService],
  exports: [VendorPayoutService],
})
export class VendorPayoutModule {}
