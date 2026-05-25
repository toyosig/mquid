import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const body = exception.getResponse() as any;

    const isValidationError =
      typeof body === 'object' && Array.isArray(body.message);

    response.status(status).json({
      statusCode: status,
      message: isValidationError ? 'Validation failed' : (body.message ?? body),
      errors: isValidationError
        ? body.message.map((msg: string) => ({
            field: msg.split(' ')[0],
            message: msg,
          }))
        : [],
    });
  }
}
