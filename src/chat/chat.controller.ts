import {
    Body,
    Controller,
    HttpException,
    HttpStatus,
    Ip,
    Post,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsArray, IsIn, IsString, MaxLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { Public } from "src/common/decorators";
import { ChatService } from "./chat.service";

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
    constructor(private readonly chatService: ChatService) {}

    @Public()
    @Post()
    @ApiOperation({ summary: "DroneGenie helper chatbot" })
    async chat(@Body() dto: ChatRequestDto, @Ip() ip: string) {
        if (!dto.messages?.length) {
            throw new HttpException("messages required", HttpStatus.BAD_REQUEST);
        }
        if (dto.messages.length > 20) {
            throw new HttpException("conversation too long", HttpStatus.BAD_REQUEST);
        }
        return this.chatService.reply(dto.messages, ip);
    }
}
