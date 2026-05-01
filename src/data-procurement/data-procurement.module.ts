import { Module } from '@nestjs/common';
import { DataProcurementController } from './data-procurement.controller';
import { DataProcurementService } from './data-procurement.service';

@Module({
  controllers: [DataProcurementController],
  providers: [DataProcurementService],
})
export class DataProcurementModule {}
