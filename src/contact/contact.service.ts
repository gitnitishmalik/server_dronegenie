import { HttpException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { ContactDto } from "./dtos/contact.dto";

@Injectable({})
export class ContactService {
    constructor(private readonly prisma: PrismaService) { }

    async send(dto: ContactDto) {
        try {
            // Build mail body (subject is intentionally not included inside the body content)
            const htmlBody = `

Full name: ${dto.fullname || ''}
Inquiry type: ${dto.inquiryType || ''}
Company: ${dto.company || ''}
Phone: ${dto.phone || ''}
Email: ${dto.email || ''}

Message:
${dto.message || ''}

---
This message was sent from your website contact form.
`;

            const mailPayload = {
                mail_to: "biswojitb474@gmail.com",
                mail_subject: dto.subject,
                mail_body: htmlBody
            };

            // Send email
            try {
                const response = await fetch("https://kgninfotech.orgnixo.com/api/send_email", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(mailPayload),
                });

                if (!response.ok) {
                    const text = await response.text().catch(() => null);
                    console.error("Mail API error:", response.status, text);
                    throw new InternalServerErrorException("Failed to send email");
                }

                return { error: 0, message: "Message sent successfully" };
            } catch (mailError) {
                console.error("Failed to call mail API:", mailError);
                throw new InternalServerErrorException("Failed to send email");
            }
        } catch (error) {
            if (error instanceof HttpException) throw error;
            console.error("send error:", error);
            throw new InternalServerErrorException("Message send Failed");
        }
    }

}