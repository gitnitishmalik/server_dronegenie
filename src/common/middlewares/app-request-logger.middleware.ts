import { Logger, NestMiddleware } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { NextFunction, Request, Response } from 'express';

export class AppRequestLoggerMiddleware implements NestMiddleware {
  private logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { ip, method, originalUrl: url } = req;
    const userAgent = req.get('user-agent') || uuidv4();
    // Setting the x-correlation-id
    const correlationHeader = req.header('x-correlation-id') || uuidv4();

    req.headers['x-correlation-id'] = correlationHeader;
    res.set('X-Correlation-Id', correlationHeader);

    res.on('close', () => {
      const { statusCode } = res;
      const contentLength = res.get('content-length');
      this.logger.log(
        JSON.stringify({
          method: method,
          path: url,
          statusCode: statusCode,
          ip: ip,
          content_length: contentLength,
          user_agent: userAgent,
          x_correlation_id: req.headers['x-correlation-id'],
        }),
      );
    });

    next();
  }
}
