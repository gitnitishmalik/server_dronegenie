import { BadRequestException, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as basicAuth from 'express-basic-auth';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import { join } from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const allowedOrigins = [
  'http://localhost:3000',
  'http://143.244.141.92',
  'https://dronegenie.in',
  'https://www.dronegenie.in',
  'https://dronegenie.aipower.guru',
  'https://drone-genie-phi.vercel.app',
];

async function bootstrap() {
  const isProd = process.env.ENV === 'PROD';

  const port = process.env.PORT || (isProd ? process.env.PROD_PORT : process.env.DEV_PORT) || 4000;

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Needed for Razorpay webhook HMAC verification — we must hash the exact
    // raw bytes Razorpay sent, not the parsed-then-reserialised JSON.
    rawBody: true,
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          // Don't throw — that surfaces as a 500 on every cross-origin OPTIONS
          // preflight from a disallowed origin. Returning `false` makes the
          // `cors` middleware reply without `Access-Control-Allow-Origin`,
          // which is the correct behavior: the browser sees no allow header
          // and blocks the request.
          callback(null, false);
        }
      },
      credentials: true,
    },
  });

  // Remove the Express fingerprint (x-powered-by: Express). Harmless on its
  // own but a free signal for scanners — no reason to broadcast the stack.
  app.disable('x-powered-by');

  // Trust loopback so req.ip / throttler bucket per real client (Caddy is on the same host).
  app.set('trust proxy', 'loopback');

  app.useStaticAssets(join(__dirname, '..', 'public'), {
    prefix: '/uploads/',
  });

  app.use('/uploads', express.static(join(__dirname, '..', 'public/uploads')));

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      stopAtFirstError: true,
      exceptionFactory: (errors) => {
        const firstError = errors[0];
        const constraints = firstError.constraints;
        const message = constraints
          ? Object.values(constraints)[0]
          : 'Validation error';
        return new BadRequestException(message);
      },
    }),
  );

  app.setGlobalPrefix('api');

  app.enableVersioning({
    type: VersioningType.URI,
  });

  if (process.env.SWAGGER_USER && process.env.SWAGGER_PASSWORD) {
    app.use(
      ['/docs', '/docs-json'],
      basicAuth({
        challenge: true,
        users: {
          [process.env.SWAGGER_USER]: process.env.SWAGGER_PASSWORD,
        },
      }),
    );

    const config = new DocumentBuilder()
      .setTitle('Drones Genie' + (isProd ? ' (PROD)' : ' ' + process.env.ENV))
      .setDescription('Drones Genie APIs')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);

    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  await app.listen(port, '0.0.0.0', () => {
    console.log(`Application is running on port ${port}`);
  });
}

bootstrap();