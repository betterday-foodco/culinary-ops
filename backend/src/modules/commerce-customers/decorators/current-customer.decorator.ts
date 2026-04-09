import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

/**
 * @CurrentCustomer() — Injects the current customer's ID into a handler.
 *
 * ⚠️ DEV STUB — NOT SECURE FOR PRODUCTION ⚠️
 *
 * Until the passwordless auth flow is built (magic link + phone OTP +
 * OAuth + CustomerSession verification), this decorator reads the
 * customer ID from an `x-dev-customer-id` request header. That means
 * any caller can impersonate any customer by setting the header.
 *
 * This is fine for local development and smoke-testing endpoints against
 * the seed data, but it MUST be replaced with a real auth guard before
 * this code is ever deployed to a public environment.
 *
 * When real auth lands, this decorator becomes:
 *
 *   const req = ctx.switchToHttp().getRequest();
 *   if (!req.customer) throw new UnauthorizedException();
 *   return req.customer.id;
 *
 * and a CustomerAuthGuard validates the refresh token from the cookie
 * or Authorization header, hashes it, looks up the CustomerSession row,
 * and attaches the Customer to `req.customer` for every protected route.
 *
 * For now: paste `x-dev-customer-id: <uuid>` into your Postman / curl
 * request to act as that customer. The seed script prints a known ID
 * to the console on every run.
 */
export const CurrentCustomer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const devCustomerId = request.headers['x-dev-customer-id'];

    if (!devCustomerId || typeof devCustomerId !== 'string') {
      throw new UnauthorizedException(
        'Missing x-dev-customer-id header. Dev stub — set it to a valid Customer.id to impersonate that customer. See commerce seed script output for known IDs.',
      );
    }

    return devCustomerId;
  },
);
