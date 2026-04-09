import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CommerceCustomersService } from './commerce-customers.service';
import { CurrentCustomer } from './decorators/current-customer.decorator';
import {
  UpdateProfileDto,
  UpdatePreferencesDto,
  UpdateNotificationsDto,
} from './dto/profile.dto';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

/**
 * Customer profile endpoints.
 *
 * Route prefix: /api/commerce/customers
 * (The global /api prefix is set in main.ts via setGlobalPrefix.)
 *
 * Auth: all routes require the @CurrentCustomer() decorator, which
 * currently reads `x-dev-customer-id` header as a dev stub. When real
 * auth lands, the decorator will read from a validated refresh token
 * session instead. All endpoints are scoped to the authenticated
 * customer — there's no way to access another customer's data through
 * this controller.
 *
 * Why no /:customerId in the URL: these endpoints are always "me." If
 * an admin needs to read or edit a specific customer, that's a separate
 * admin controller (not built yet).
 */
@Controller('commerce/customers')
export class CommerceCustomersController {
  constructor(private readonly service: CommerceCustomersService) {}

  // ─── Profile ─────────────────────────────────────────────────────────────

  @Get('me')
  async getMe(@CurrentCustomer() customerId: string) {
    return this.service.getMe(customerId);
  }

  @Patch('me')
  async updateProfile(
    @CurrentCustomer() customerId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.service.updateProfile(customerId, dto);
  }

  @Patch('me/preferences')
  async updatePreferences(
    @CurrentCustomer() customerId: string,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.service.updatePreferences(customerId, dto);
  }

  @Patch('me/notifications')
  async updateNotifications(
    @CurrentCustomer() customerId: string,
    @Body() dto: UpdateNotificationsDto,
  ) {
    return this.service.updateNotifications(customerId, dto);
  }

  // ─── Addresses ───────────────────────────────────────────────────────────

  @Get('me/addresses')
  async listAddresses(@CurrentCustomer() customerId: string) {
    return this.service.listAddresses(customerId);
  }

  @Post('me/addresses')
  async createAddress(
    @CurrentCustomer() customerId: string,
    @Body() dto: CreateAddressDto,
  ) {
    return this.service.createAddress(customerId, dto);
  }

  @Patch('me/addresses/:id')
  async updateAddress(
    @CurrentCustomer() customerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.service.updateAddress(customerId, id, dto);
  }

  @Delete('me/addresses/:id')
  @HttpCode(HttpStatus.OK)
  async deleteAddress(
    @CurrentCustomer() customerId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.deleteAddress(customerId, id);
  }

  @Post('me/addresses/:id/default')
  async setDefaultAddress(
    @CurrentCustomer() customerId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.setDefaultAddress(customerId, id);
  }

  // ─── Payment methods ─────────────────────────────────────────────────────

  @Get('me/payment-methods')
  async listPaymentMethods(@CurrentCustomer() customerId: string) {
    return this.service.listPaymentMethods(customerId);
  }

  @Delete('me/payment-methods/:id')
  @HttpCode(HttpStatus.OK)
  async deletePaymentMethod(
    @CurrentCustomer() customerId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.deletePaymentMethod(customerId, id);
  }

  @Post('me/payment-methods/:id/default')
  async setDefaultPaymentMethod(
    @CurrentCustomer() customerId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.setDefaultPaymentMethod(customerId, id);
  }
}
