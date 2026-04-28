import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppRequestLoggerMiddleware } from './common/middlewares';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AtGaurd, RolesGuard } from './common/guards';

import { AuthModule } from './auth/auth.module';
import { VendorModule } from './vendor/vendor.module';
import { BankModule } from './bank/bank.module';
import { DroneServiceModule } from './drone-service/drone-service.module';
import { CustomerModule } from './customer/customer.module';
import { VendorServiceModule } from './vendor-service/vendor-service.module';
import { ServiceCategoryModule } from './service-category/service-category.module';
import { UserModule } from './user/user.module';
import { PropertiesModule } from './wcu-properties/properties.module';
import { VendorDocumentModule } from './vendor-doc/vendor-doc.module';
import { SettingModule } from './setting/setting.module';
import { BidRequestModule } from './bid-req/bid-req.module';
import { MailModule } from './mail/mail.module';
import { IndustryModule } from './industry/industry.module';
import { BidReplyModule } from './bid-reply/bid-reply.module';
import { OrderModule } from './order/order.module';
import { InvoiceModule } from './invoice/invoice.module';
import { AdminModule } from './admin/admin.module';
import { ContactModule } from './contact/contact.module';
import { CategoryMediaModule } from './category-media/category-media.module';
import { IndustryMediaModule } from './industry-media/industry-media.module';
import { FaqModule } from './faq/faq.module';
import { RequestCallbackModule } from './request-callback/request-callback.module';
import { ChatModule } from './chat/chat.module';
import { PaymentModule } from './payment/payment.module';
import { PublicConfigModule } from './public-config/public-config.module';
import { VendorPayoutModule } from './vendor-payout/vendor-payout.module';
import { RazorpayWebhookModule } from './razorpay-webhook/razorpay-webhook.module';
import { SeoMetaModule } from './seo-meta/seo-meta.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // Global IP-based rate limiter. Default is permissive (60 req/min) to
    // avoid breaking normal UI usage; sensitive routes (auth/*, razorpay-webhook
    // debug paths) override with stricter limits using @Throttle({...}) on the
    // specific handler. See src/auth/auth.controller.ts.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,       // 1 minute window
        limit: 60,         // 60 requests per IP per minute
      },
      {
        name: 'auth-strict',
        ttl: 15 * 60_000,  // 15 minute window
        limit: 10,         // 10 auth attempts per IP per 15 min
      },
      {
        name: 'otp-strict',
        ttl: 60 * 60_000,  // 1 hour window
        limit: 20,         // 20 OTP verification attempts per IP per hour
      },
    ]),
    AuthModule,
    MailModule,
    VendorModule,
    CustomerModule,
    BankModule,
    DroneServiceModule,
    VendorServiceModule,
    ServiceCategoryModule,
    PropertiesModule,
    VendorDocumentModule,
    SettingModule,
    BidRequestModule,
    IndustryModule,
    BidReplyModule,
    OrderModule,
    InvoiceModule,
    AdminModule,
    UserModule,
    ContactModule,
    CategoryMediaModule,
    IndustryMediaModule,
    FaqModule,
    RequestCallbackModule,
    ChatModule,
    PaymentModule,
    PublicConfigModule,
    VendorPayoutModule,
    RazorpayWebhookModule,
    SeoMetaModule,
  ],
  controllers: [],
  providers: [
    {
      // Rate limiter runs first so floods can't exhaust DB / bcrypt on auth routes.
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AtGaurd,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(AppRequestLoggerMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
