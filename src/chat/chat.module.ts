import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { MailModule } from 'src/mail/mail.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [PrismaModule, MailModule, JwtModule.register({})],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
