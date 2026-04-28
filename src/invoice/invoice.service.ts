import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { InvoiceDto } from "./dtos/invoice.dto";
import { InvoiceType } from "src/common/enums";
import { generateCustomerHTMLTemplate } from "./invoice-template/customer-in-template"
import { generateVendorHTMLTemplate } from "./invoice-template/vendor-in-template";
import { generatePDF } from "../common/utils/generate-pdf"
import { uploadBufferFileToLocal } from "src/common/utils/local-file-upload.util";
import { Prisma, PrismaClient, UserRole } from "@prisma/client";
import { MailService } from "src/mail/mail.service";
import { JwtPayload } from "src/auth/types/jwtPayload.type";

@Injectable({})
export class InvoiceService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly mailService: MailService,
    ) { }

    // Admin tool: re-render the PDF from an existing invoice row + order data
    // and email it. Does NOT create a new invoice row or touch sequence numbers
    // — the invoice number stays stable. If the invoice row doesn't exist yet
    // (order never reached COMPLETED or PR #10 never fired), tell admin to
    // generate first instead of silently creating one here.
    async resendInvoiceEmail(orderId: string, role: UserRole) {
        if (role !== UserRole.VENDOR && role !== UserRole.CUSTOMER) {
            throw new BadRequestException('role must be VENDOR or CUSTOMER');
        }

        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                vendor: true,
                customer: true,
                bidRequest: true,
                service: true,
                vendor_invoice: true,
                customer_invoice: true,
            },
        });
        if (!order) throw new NotFoundException('Order not found');

        const isVendor = role === UserRole.VENDOR;
        const invoiceRow = isVendor ? order.vendor_invoice : order.customer_invoice;
        if (!invoiceRow) {
            throw new NotFoundException(
                `No ${isVendor ? 'vendor' : 'customer'} invoice exists for this order yet`,
            );
        }

        const party = isVendor ? order.vendor : order.customer;
        if (!party?.representative_email) {
            throw new BadRequestException(
                `${isVendor ? 'Vendor' : 'Customer'} has no email on file`,
            );
        }

        // Reconstruct the stable invoice number from the persisted row so the
        // resent PDF shows the exact same identifier as the original send.
        const invoiceNumber = `${invoiceRow.seed}-${String(invoiceRow.latest).padStart(4, '0')}`;

        const baseData: any = {
            invoiceNumber,
            issueDate: invoiceRow.createdAt
                ? new Date(invoiceRow.createdAt).toLocaleDateString('en-IN')
                : new Date().toLocaleDateString('en-IN'),
            placeOfSupply: 'Delhi',
            type: isVendor ? 'VENDOR' : 'CUSTOMER',
        };

        let html: string;
        let fileName: string;
        if (isVendor) {
            const invoiceData = {
                ...baseData,
                vendor: {
                    name: order.vendor.representative || order.vendor.comp_name,
                    address: order.vendor.address,
                    gstin: order.vendor.GST,
                    phone: order.vendor.representative_phone,
                },
                items: [{
                    name: order.service_name,
                    price: order.vendor_price,
                    total: order.vendor_price,
                }],
                subtotal: order.vendor_price,
                gst: order.vendor_gst,
                taxAmount: order.vendor_total - order.vendor_price,
                grandTotal: order.vendor_total,
            };
            html = generateVendorHTMLTemplate(invoiceData, order);
            fileName = `vendor-invoice-${invoiceNumber}.pdf`;
        } else {
            const invoiceData = {
                ...baseData,
                customer: {
                    name: order.customer.representative || order.customer.comp_name,
                    address: order.customer.address,
                    gstin: order.customer.GST,
                    phone: order.customer.representative_phone,
                },
                items: [{
                    name: order.service_name,
                    description: order.job_desc,
                    price: order.dg_price,
                    total: order.dg_price,
                }],
                subtotal: order.dg_price,
                gst: order.dg_gst,
                taxAmount: order.customer_total - order.dg_price,
                grandTotal: order.customer_total,
            };
            html = generateCustomerHTMLTemplate(invoiceData, order);
            fileName = `customer-invoice-${invoiceNumber}.pdf`;
        }

        const pdfBuffer = await generatePDF(html);
        if (!pdfBuffer) throw new Error('Failed to regenerate invoice PDF');

        const result = await this.mailService.sendInvoiceEmail(
            party.representative_email,
            party.representative || party.comp_name || (isVendor ? 'Vendor' : 'Customer'),
            invoiceNumber,
            order.orderNo ?? orderId,
            isVendor ? 'VENDOR' : 'CUSTOMER',
            pdfBuffer,
            fileName,
        );

        if (!result?.success) {
            throw new Error(result?.error || 'Email dispatch failed');
        }

        return {
            success: true,
            sentTo: party.representative_email,
            invoiceNumber,
        };
    }

    // caller is optional:
    //   - HTTP controllers MUST pass the authenticated JwtPayload so that
    //     we can enforce self-or-admin ownership against the order.
    //   - Internal callers (order.service.tryAutoGenerateInvoices) omit it;
    //     they run on trusted code paths that already gated on role/ownership.
    async generateInvoice(dto: InvoiceDto, type: UserRole, caller?: JwtPayload) {
        return this.prisma.$transaction(async (tx) => {

            // 1️⃣ Fetch order inside transaction
            const order = await tx.order.findUnique({
                where: { id: dto.orderId },
                include: {
                    vendor: true,
                    customer: true,
                    bidRequest: true,
                    service: true,
                },
            });

            if (!order) {
                throw new NotFoundException('Order Not Found');
            }

            // Ownership check for HTTP callers only.
            // Vendor PDF → caller must be the vendor on the order (or admin).
            // Customer PDF → caller must be the customer on the order (or admin).
            if (caller) {
                const isAdmin = caller.role?.includes(UserRole.ADMIN);
                if (!isAdmin) {
                    const ownerUserId =
                        type === UserRole.VENDOR ? order.vendor?.userId :
                        type === UserRole.CUSTOMER ? order.customer?.userId :
                        null;
                    if (!ownerUserId || ownerUserId !== caller.sub) {
                        throw new ForbiddenException('You can only download your own invoice');
                    }
                }
            }

            let vendorInvoiceId = order.vendor_invoice_id;
            let customerInvoiceId = order.customer_invoice_id;

            let vendorInvoiceRecord: any = null;
            let customerInvoiceRecord: any = null;

            // 2️⃣ Create Vendor Invoice (if required & not exists)
            if (
                type === UserRole.VENDOR &&
                !order.vendor_invoice_id
            ) {
                vendorInvoiceRecord = await this.createVendorInvoice(tx, order);
                vendorInvoiceId = vendorInvoiceRecord.invoice.id;
            }

            // 3️⃣ Create Customer Invoice (if required & not exists)
            if (
                type === UserRole.CUSTOMER &&
                !order.customer_invoice_id
            ) {
                customerInvoiceRecord = await this.createCustomerInvoice(tx, order);
                customerInvoiceId = customerInvoiceRecord.invoice.id;
            }

            // 4️⃣ Update order only if something changed
            if (
                vendorInvoiceId !== order.vendor_invoice_id ||
                customerInvoiceId !== order.customer_invoice_id
            ) {
                await tx.order.update({
                    where: { id: order.id },
                    data: {
                        vendor_invoice_id: vendorInvoiceId,
                        customer_invoice_id: customerInvoiceId,
                    },
                });
            }

            return {
                vendorInvoiceRecord,
                customerInvoiceRecord,
                message: 'Invoice generated successfully',
            };
        });
    }



    private async getNextInvoiceSequence(tx: PrismaClient | Prisma.TransactionClient, year: number) {
        try {
            // try atomic upsert + increment (SQL adapters)
            const updated = await (tx as any).invoiceCounter.upsert({
                where: { year },
                update: { seq: { increment: 1 } },
                create: { year, seq: 1 },
            });
            return updated.seq as number;
        } catch (err) {
            // fallback for adapters (e.g. Mongo) that don't support increment in upsert
            const existing = await (tx as any).invoiceCounter.findUnique({ where: { year } });
            if (!existing) {
                const created = await (tx as any).invoiceCounter.create({ data: { year, seq: 1 } });
                return created.seq as number;
            }
            const updated = await (tx as any).invoiceCounter.update({
                where: { year },
                data: { seq: existing.seq + 1 },
            });
            return updated.seq as number;
        }
    }


    private async generateInvoiceNumber(
        tx: PrismaClient | Prisma.TransactionClient,
        type: InvoiceType,
    ) {
        const year = new Date().getFullYear();

        // 1️⃣ get next sequence atomically
        const seq = await this.getNextInvoiceSequence(tx, year);

        // 2️⃣ prefix by type
        const prefix = type === InvoiceType.VENDOR ? 'V' : 'C';

        // 3️⃣ format invoice number
        const padded = String(seq).padStart(4, '0');

        const invoiceNumber = `DG-${year}-${prefix}-${padded}`;

        return {
            invoiceNumber,
            year,
            seq,
        };
    }


    // private async createVendorInvoice(order: any) {
    //     // Generate invoice seed and get latest number
    //     const currentYear = new Date().getFullYear();
    //     const baseSeed = `DG_${currentYear}V`;

    //     const latestInvoice = await this.prisma.invoice.findFirst({
    //         where: {
    //             seed: { startsWith: baseSeed },
    //             type: InvoiceType.VENDOR
    //         },
    //         orderBy: { latest: 'desc' }
    //     });

    //     const latestNumber = latestInvoice ? Number(latestInvoice.latest) + 1 : 1;
    //     const latestPadded = latestNumber.toString().padStart(2, '0');

    //     const seed = `${baseSeed}_${latestPadded}`;
    //     const invoiceNumber = seed;

    //     const invoiceData = {
    //         invoiceNumber,
    //         issueDate: new Date().toLocaleDateString('en-IN'),
    //         placeOfSupply: 'Delhi',
    //         type: 'VENDOR',
    //         vendor: {
    //             name: order.vendor.representative || order.vendor.comp_name,
    //             address: order.vendor.address,
    //             gstin: order.vendor.GST,
    //             phone: order.vendor.representative_phone,
    //         },
    //         items: [{
    //             name: order.service_name,
    //             price: order.vendor_price,
    //             total: order.vendor_price
    //         }],
    //         subtotal: order.vendor_price,
    //         gst: order.vendor_gst,
    //         taxAmount: order.vendor_total - order.vendor_price,
    //         grandTotal: order.vendor_total
    //     };

    //     const htmlTemplate = generateVendorHTMLTemplate(invoiceData, order);
    //     const pdfBuffer = await generatePDF(htmlTemplate);
    //     if (!pdfBuffer) throw new Error('Failed to generate PDF');

    //     const fileName = `vendor-invoice-${invoiceNumber}.pdf`;

    //     // const fileUrl = await uploadBufferFileToLocal(pdfBuffer, fileName, 'application/pdf');

    //     const invoice = await this.prisma.invoice.create({
    //         data: {
    //             seed,
    //             latest: latestNumber,
    //             type: InvoiceType.VENDOR,
    //             vendor_Invoice: fileName,
    //             customer_Invoice: ''
    //         }
    //     });

    //     return { invoice, buffer: pdfBuffer, fileName, seed: baseSeed };
    // }

    private async createVendorInvoice(
        tx: PrismaClient | Prisma.TransactionClient,
        order: any,
    ) {
        // 1️⃣ Generate invoice number safely
        const { invoiceNumber, year, seq } =
            await this.generateInvoiceNumber(tx, InvoiceType.VENDOR);

        const invoiceData = {
            invoiceNumber,
            issueDate: new Date().toLocaleDateString('en-IN'),
            placeOfSupply: 'Delhi',
            type: 'VENDOR',
            vendor: {
                name: order.vendor.representative || order.vendor.comp_name,
                address: order.vendor.address,
                gstin: order.vendor.GST,
                phone: order.vendor.representative_phone,
            },
            items: [
                {
                    name: order.service_name,
                    price: order.vendor_price,
                    total: order.vendor_price,
                },
            ],
            subtotal: order.vendor_price,
            gst: order.vendor_gst,
            taxAmount: order.vendor_total - order.vendor_price,
            grandTotal: order.vendor_total,
        };

        const htmlTemplate = generateVendorHTMLTemplate(invoiceData, order);
        const pdfBuffer = await generatePDF(htmlTemplate);
        if (!pdfBuffer) throw new Error('Failed to generate PDF');

        const fileName = `vendor-invoice-${invoiceNumber}.pdf`;

        const invoice = await tx.invoice.create({
            data: {
                seed: `DG-${year}-V`,
                latest: seq,
                type: InvoiceType.VENDOR,
                vendor_Invoice: fileName,
                customer_Invoice: '',
            },
        });

        return { invoice, buffer: pdfBuffer, fileName };
    }




    // private async createCustomerInvoice(order: any) {
    //     const currentYear = new Date().getFullYear();
    //     const baseSeed = `DG_${currentYear}C`;

    //     const latestInvoice = await this.prisma.invoice.findFirst({
    //         where: {
    //             seed: { startsWith: baseSeed },
    //             type: InvoiceType.CUSTOMER
    //         },
    //         orderBy: { latest: 'desc' }
    //     });

    //     const latestNumber = latestInvoice ? Number(latestInvoice.latest) + 1 : 1;
    //     const latestPadded = latestNumber.toString().padStart(2, '0');

    //     const seed = `${baseSeed}_${latestPadded}`;
    //     const invoiceNumber = seed;

    //     const invoiceData = {
    //         invoiceNumber,
    //         issueDate: new Date().toLocaleDateString('en-IN'),
    //         placeOfSupply: 'Delhi',
    //         type: 'CUSTOMER',
    //         customer: {
    //             name: order.customer.representative || order.customer.comp_name,
    //             address: order.customer.address,
    //             gstin: order.customer.GST,
    //             phone: order.customer.representative_phone,

    //         },
    //         items: [{
    //             name: order.service_name,
    //             description: order.job_desc,
    //             price: order.dg_price,
    //             total: order.dg_price
    //         }],
    //         subtotal: order.dg_price,
    //         gst: order.dg_gst,
    //         taxAmount: order.customer_total - order.dg_price,
    //         grandTotal: order.customer_total
    //     };

    //     const htmlTemplate = generateCustomerHTMLTemplate(invoiceData, order);
    //     const pdfBuffer = await generatePDF(htmlTemplate);

    //     const fileName = `customer-invoice-${invoiceNumber}.pdf`;

    //     // const fileUrl = await uploadBufferFileToLocal(pdfBuffer, fileName, 'application/pdf');

    //     const invoice = await this.prisma.invoice.create({
    //         data: {
    //             seed,
    //             latest: latestNumber,
    //             type: InvoiceType.CUSTOMER,
    //             vendor_Invoice: '',
    //             customer_Invoice: fileName
    //         }
    //     });

    //     return { invoice, buffer: pdfBuffer, fileName, seed: baseSeed };
    // }

    private async createCustomerInvoice(
        tx: PrismaClient | Prisma.TransactionClient,
        order: any,
    ) {
        const { invoiceNumber, year, seq } =
            await this.generateInvoiceNumber(tx, InvoiceType.CUSTOMER);

        const invoiceData = {
            invoiceNumber,
            issueDate: new Date().toLocaleDateString('en-IN'),
            placeOfSupply: 'Delhi',
            type: 'CUSTOMER',
            customer: {
                name: order.customer.representative || order.customer.comp_name,
                address: order.customer.address,
                gstin: order.customer.GST,
                phone: order.customer.representative_phone,
            },
            items: [
                {
                    name: order.service_name,
                    description: order.job_desc,
                    price: order.dg_price,
                    total: order.dg_price,
                },
            ],
            subtotal: order.dg_price,
            gst: order.dg_gst,
            taxAmount: order.customer_total - order.dg_price,
            grandTotal: order.customer_total,
        };

        const htmlTemplate = generateCustomerHTMLTemplate(invoiceData, order);
        const pdfBuffer = await generatePDF(htmlTemplate);
        if (!pdfBuffer) throw new Error('Failed to generate PDF');

        const fileName = `customer-invoice-${invoiceNumber}.pdf`;

        const invoice = await tx.invoice.create({
            data: {
                seed: `DG-${year}-C`,
                latest: seq,
                type: InvoiceType.CUSTOMER,
                vendor_Invoice: '',
                customer_Invoice: fileName,
            },
        });

        return { invoice, buffer: pdfBuffer, fileName };
    }



    // caller is optional for backward compatibility with internal usage,
    // but HTTP controllers MUST pass it so we can enforce ownership.
    async getInvoicesByOrderId(orderId: string, caller?: JwtPayload) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                vendor: { select: { userId: true } },
                customer: { select: { userId: true } },
                vendor_invoice: true,
                customer_invoice: true
            }
        });

        if (!order) {
            throw new NotFoundException("Order Not Found");
        }

        if (caller) {
            const isAdmin = caller.role?.includes(UserRole.ADMIN);
            const isVendor = order.vendor?.userId === caller.sub;
            const isCustomer = order.customer?.userId === caller.sub;
            if (!isAdmin && !isVendor && !isCustomer) {
                throw new ForbiddenException('You can only view invoices on your own orders');
            }
        }

        return {
            vendorInvoice: order.vendor_invoice,
            customerInvoice: order.customer_invoice
        };
    }
}