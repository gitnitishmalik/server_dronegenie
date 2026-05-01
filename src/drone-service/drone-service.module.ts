import { Module } from '@nestjs/common';
import { DroneServiceService } from './drone-service.service';
import { DroneServiceController } from './drone-service.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [DroneServiceService],
  controllers: [DroneServiceController],
})
export class DroneServiceModule {}
