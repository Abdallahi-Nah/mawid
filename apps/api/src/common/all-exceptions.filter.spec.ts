import { BadRequestException } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';

function run(err: unknown) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) };
  new AllExceptionsFilter().catch(err, host as never);
  return { status, json };
}

describe('AllExceptionsFilter', () => {
  it('returns {code, message} for unknown errors', () => {
    const { status, json } = run(new Error('boom'));
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  });
  it('puts validation messages in details', () => {
    const { json } = run(new BadRequestException(['a must be a string']));
    expect(json).toHaveBeenCalledWith({
      code: 'BAD_REQUEST', message: 'Validation failed', details: ['a must be a string'],
    });
  });
});
