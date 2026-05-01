import {
    Body,
    Controller,
    Headers,
    HttpException,
    HttpStatus,
    Ip,
    Post,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsArray, IsIn, IsString, MaxLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { Public } from "src/common/decorators";
import { ChatService, ChatAuth } from "./chat.service";
import { PrismaService } from "src/prisma/prisma.service";
import { UserRole } from "@prisma/client";

class ChatMessageDto {
    @IsIn(["user", "assistant"])
    role: "user" | "assistant";

    @IsString()
    @MaxLength(4000)
    content: string;
}

class ChatRequestDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ChatMessageDto)
    messages: ChatMessageDto[];
}

@ApiTags("Chat")
@Controller({ path: "chat", version: "1" })
export class ChatController {
    constructor(
        private readonly chatService: ChatService,
        private readonly jwt: JwtService,
        private readonly prisma: PrismaService,
    ) {}

    private async resolveAuth(authHeader?: string): Promise<ChatAuth | undefined> {
        if (!authHeader) return undefined;
        const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
        if (!m) return undefined;
        const secret = process.env.AT_SECRET;
        if (!secret) return undefined;
        try {
            const payload: any = await this.jwt.verifyAsync(m[1], { secret });
            const userId: string | undefined = payload?.sub;
            const roles: UserRole[] = Array.isArray(payload?.role) ? payload.role : [];
            if (!userId || roles.length === 0) return undefined;

            let customerId: string | undefined;
            let vendorId: string | undefined;
            let displayName: string | undefined;

            if (roles.includes(UserRole.CUSTOMER)) {
                const c = await this.prisma.customer.findUnique({
                    where: { userId },
                    select: { id: true, representative: true, comp_name: true },
                });
                if (c) {
                    customerId = c.id;
                    displayName = c.representative || c.comp_name || displayName;
                }
            }
            if (roles.includes(UserRole.VENDOR)) {
                const v = await this.prisma.vendor.findUnique({
                    where: { userId },
                    select: { id: true, representative: true, comp_name: true },
                });
                if (v) {
                    vendorId = v.id;
                    displayName = displayName || v.representative || v.comp_name || undefined;
                }
            }

            return { userId, roles, customerId, vendorId, displayName };
        } catch {
            return undefined;
        }
    }

    @Public()
    @Post()
    @ApiOperation({ summary: "DroneGenie helper chatbot" })
    async chat(
        @Body() dto: ChatRequestDto,
        @Ip() ip: string,
        @Headers("authorization") authHeader?: string,
    ) {
        if (!dto.messages?.length) {
            throw new HttpException("messages required", HttpStatus.BAD_REQUEST);
        }
        if (dto.messages.length > 20) {
            throw new HttpException("conversation too long", HttpStatus.BAD_REQUEST);
        }
        const auth = await this.resolveAuth(authHeader);
        return this.chatService.reply(dto.messages, ip, auth);
    }
}
