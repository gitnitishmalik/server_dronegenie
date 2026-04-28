import { Module } from '@nestjs/common';
import { VendorServiceService } from './vendor-service.service';
import { VendorServiceController } from './vendor-service.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [VendorServiceController],
  providers: [VendorServiceService],
})
export class VendorServiceModule {}
