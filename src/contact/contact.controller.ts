import { Body, Controller, Post } from '@nestjs/common';
import { ContactService } from './contact.service';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ContactDto } from './dtos/contact.dto';
import { Public, Roles } from 'src/common/decorators';
import { UserRole } from '@prisma/client';

@ApiTags('Contact')
@Controller({
  path: 'contact',
  version: '1',
})
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Public()
  @Post('send')
  @Roles(UserRole.CUSTOMER, UserRole.VENDOR)
  @ApiOperation({ summary: 'Send Inquiry Message' })
  @ApiResponse({ status: 200, description: 'Message Send Successfully' })
  async sendInquiryMessage(@Body() dto: ContactDto) {
    return await this.contactService.send(dto);
  }
}
