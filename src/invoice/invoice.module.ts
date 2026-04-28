import { Module } from "@nestjs/common";
import { PrismaModule } from "src/prisma/prisma.module";
import { MailModule } from "src/mail/mail.module";
import { InvoiceController } from "./invoice.controller";
import { InvoiceService } from "./invoice.service";

@Module({
    imports: [PrismaModule, MailModule],
    controllers: [InvoiceController],
    providers: [InvoiceService],
    exports: [InvoiceService],
})
export class InvoiceModule{}