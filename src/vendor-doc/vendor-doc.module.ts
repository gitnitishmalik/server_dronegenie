import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { VendorDocumentService } from './vendor-doc.service';
import { VendorDocumentController } from './vendor-doc.controller';

@Module({
  imports: [PrismaModule],
  providers: [VendorDocumentService],
  controllers: [VendorDocumentController],
})
export class VendorDocumentModule {}
