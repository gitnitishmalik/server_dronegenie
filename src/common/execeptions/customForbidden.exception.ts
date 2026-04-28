import { ForbiddenException as NestForbiddenException } from '@nestjs/common';

export class CustomForbiddenException extends NestForbiddenException {
  constructor(message: string, statusCode: number = 403) {
    super({
      statusCode: statusCode,
      message: message,
      error: 'Forbidden',
      success: false,
    });
  }
}
