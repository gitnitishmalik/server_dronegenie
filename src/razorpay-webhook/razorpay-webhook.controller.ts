import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { Public } from 'src/common/decorators';
import { RazorpayWebhookService } from './razorpay-webhook.service';


// Hidden from Swagger — not a user-facing endpoint. Razorpay POSTs here.
@ApiExcludeController()
@Controller({ path: 'razorpay-webhook', version: '1' })
export class RazorpayWebhookController {
  constructor(private readonly svc: RazorpayWebhookService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-razorpay-signature') signature: string | undefined,
    @Body() body: any,
  ) {
    const ok = this.svc.verify(req.rawBody, signature);
    if (!ok) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // Attach the signature for audit; the service persists it on the row.
    const event = { ...body, __signature: signature };
    const result = await this.svc.process(event);
    return { ok: true, ...result };
  }
}
