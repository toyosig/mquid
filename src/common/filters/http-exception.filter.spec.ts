import { HttpException, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

function makeHost(statusFn: jest.Mock, jsonFn: jest.Mock) {
  return {
    switchToHttp: () => ({
      getResponse: () => ({ status: statusFn, json: jsonFn }),
    }),
  } as any;
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let json: jest.Mock;
  let status: jest.Mock;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
  });

  it('returns standard error shape for plain HttpException', () => {
    const ex = new HttpException('Not found', HttpStatus.NOT_FOUND);
    filter.catch(ex, makeHost(status, json));
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ statusCode: 404, message: 'Not found', errors: [] });
  });

  it('formats validation errors into field/message pairs', () => {
    const ex = new HttpException(
      { message: ['email must be an email', 'password must be longer than 6'], error: 'Bad Request' },
      HttpStatus.BAD_REQUEST,
    );
    filter.catch(ex, makeHost(status, json));
    const call = json.mock.calls[0][0];
    expect(call.message).toBe('Validation failed');
    expect(call.errors).toHaveLength(2);
    expect(call.errors[0].field).toBe('email');
  });
});
