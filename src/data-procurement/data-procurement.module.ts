import { Module } from '@nestjs/common';
import { DataProcurementController } from './data-procurement.controller';
import { DataProcurementService } from './data-procurement.service';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DataProcurementController],
  providers: [DataProcurementService],
})
export class DataProcurementModule {}
