import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { CommercePrismaService } from '../../prisma/commerce-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileDto, UpdatePreferencesDto, UpdateNotificationsDto } from './dto/profile.dto';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

/**
 * CommerceCustomersService — all logic for the customer profile surface.
 *
 * Every method in this class takes a `customerId` as the first argument
 * and scopes all queries to that customer. This is how we prevent customer
 * A from reading or editing customer B's data — the customerId comes from
 * the authenticated request context (currently stubbed via the
 * @CurrentCustomer() decorator, eventually from a real auth guard).
 *
 * This service intentionally does NOT handle:
 *   - Auth flows (magic link, OTP, OAuth) — see commerce-auth module (planned)
 *   - Email / phone change (needs CustomerAuthToken verification first)
 *   - Creating payment methods (needs HelcimPay.js integration)
 *   - Subscriptions / orders / cart — separate modules
 *
 * Delete operations are HARD deletes for addresses and payment methods.
 * That's a conscious choice: these are user-owned list items that the
 * customer expects to disappear when they click "Delete." For Customer
 * itself we'd use a soft delete (set status='cancelled'), but that's
 * out of scope for this service.
 */
@Injectable()
export class CommerceCustomersService {
  constructor(
    private commerce: CommercePrismaService,
    // Culinary client — injected solely to validate Customer.diet_plan_id
    // against culinary.SystemTag before writing. See
    // updatePreferences() for the cross-database validation rationale.
    private culinary: PrismaService,
  ) {}

  // ─── Profile ─────────────────────────────────────────────────────────────

  /**
   * Full profile with all related surface the subscriber hub displays:
   * addresses, payment methods, the (optional) subscription, notification
   * opts, and preferences. Strips admin-only fields on the way out.
   */
  async getMe(customerId: string) {
    const customer = await this.commerce.customer.findUnique({
      where: { id: customerId },
      include: {
        addresses: { orderBy: [{ is_default: 'desc' }, { created_at: 'asc' }] },
        payment_methods: { orderBy: [{ is_default: 'desc' }, { created_at: 'asc' }] },
        subscription: true,
      },
    });

    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }

    // Strip admin-only fields before returning to the customer's own UI.
    // Note: flagged is also admin-only but leaving it off the pick list
    // for now — the customer shouldn't know they're flagged.
    const {
      internal_notes,
      tags,
      flagged,
      flagged_reason,
      last_contacted_at,
      ...publicCustomer
    } = customer;

    return publicCustomer;
  }

  /**
   * Update basic profile fields. Only fields present in the DTO are
   * written. Birthday string is parsed to a Date before the write.
   */
  async updateProfile(customerId: string, dto: UpdateProfileDto) {
    const data: Record<string, unknown> = {};
    if (dto.first_name !== undefined) data.first_name = dto.first_name;
    if (dto.last_name !== undefined) data.last_name = dto.last_name;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.birthday !== undefined) data.birthday = new Date(dto.birthday);

    return this.commerce.customer.update({
      where: { id: customerId },
      data,
      select: {
        id: true,
        first_name: true,
        last_name: true,
        phone: true,
        birthday: true,
        updated_at: true,
      },
    });
  }

  /**
   * Update dietary preferences. Array fields REPLACE (not merge) — send
   * the full new list. Omitted fields are left unchanged.
   *
   * diet_plan_id is validated against the CULINARY database's SystemTag
   * table before being written here. This is a cross-database read
   * because SystemTag lives in the culinary project (rapid-lake) and
   * Customer lives in the commerce project (spring-fire) — Postgres
   * cannot enforce referential integrity between the two, so the
   * service layer does it. Passing null clears the diet plan.
   */
  async updatePreferences(customerId: string, dto: UpdatePreferencesDto) {
    const data: Record<string, unknown> = {};

    if (dto.diet_plan_id !== undefined) {
      if (dto.diet_plan_id !== null) {
        // Verify the UUID points at a real SystemTag with type='diets'.
        // findFirst so we can match both id and type in one query.
        const dietPlan = await this.culinary.systemTag.findFirst({
          where: { id: dto.diet_plan_id, type: 'diets' },
          select: { id: true },
        });
        if (!dietPlan) {
          throw new BadRequestException(
            `diet_plan_id ${dto.diet_plan_id} is not a valid diet plan SystemTag`,
          );
        }
      }
      data.diet_plan_id = dto.diet_plan_id;
    }

    if (dto.allergens !== undefined) data.allergens = dto.allergens;
    if (dto.diet_tags !== undefined) data.diet_tags = dto.diet_tags;
    if (dto.disliked_meals !== undefined) data.disliked_meals = dto.disliked_meals;
    if (dto.favorite_meals !== undefined) data.favorite_meals = dto.favorite_meals;

    return this.commerce.customer.update({
      where: { id: customerId },
      data,
      select: {
        id: true,
        diet_plan_id: true,
        allergens: true,
        diet_tags: true,
        disliked_meals: true,
        favorite_meals: true,
        updated_at: true,
      },
    });
  }

  /**
   * Update notification channel opts. Each channel independent.
   */
  async updateNotifications(customerId: string, dto: UpdateNotificationsDto) {
    const data: Record<string, unknown> = {};
    if (dto.sms_opt_in !== undefined) data.sms_opt_in = dto.sms_opt_in;
    if (dto.email_opt_in !== undefined) data.email_opt_in = dto.email_opt_in;

    return this.commerce.customer.update({
      where: { id: customerId },
      data,
      select: {
        id: true,
        sms_opt_in: true,
        email_opt_in: true,
        updated_at: true,
      },
    });
  }

  // ─── Addresses ───────────────────────────────────────────────────────────

  async listAddresses(customerId: string) {
    return this.commerce.customerAddress.findMany({
      where: { customer_id: customerId },
      orderBy: [{ is_default: 'desc' }, { created_at: 'asc' }],
    });
  }

  /**
   * Create a new address scoped to this customer. New addresses are never
   * default on creation — the customer explicitly sets default via
   * setDefaultAddress(). This keeps the default-address invariant
   * enforced in one place.
   */
  async createAddress(customerId: string, dto: CreateAddressDto) {
    return this.commerce.customerAddress.create({
      data: {
        customer_id: customerId,
        label: dto.label,
        type: dto.type ?? 'delivery',
        recipient_first_name: dto.recipient_first_name,
        recipient_last_name: dto.recipient_last_name,
        recipient_email: dto.recipient_email,
        recipient_phone: dto.recipient_phone,
        company: dto.company,
        street: dto.street,
        street2: dto.street2,
        city: dto.city,
        state: dto.state,
        zip: dto.zip,
        delivery_instructions: dto.delivery_instructions,
        is_default: false,
      },
    });
  }

  /**
   * Update an existing address. First verifies the address belongs to the
   * current customer — otherwise customer A could edit customer B's
   * addresses by guessing UUIDs.
   */
  async updateAddress(customerId: string, addressId: string, dto: UpdateAddressDto) {
    await this.assertAddressOwnedBy(customerId, addressId);

    return this.commerce.customerAddress.update({
      where: { id: addressId },
      data: {
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.recipient_first_name !== undefined && { recipient_first_name: dto.recipient_first_name }),
        ...(dto.recipient_last_name !== undefined && { recipient_last_name: dto.recipient_last_name }),
        ...(dto.recipient_email !== undefined && { recipient_email: dto.recipient_email }),
        ...(dto.recipient_phone !== undefined && { recipient_phone: dto.recipient_phone }),
        ...(dto.company !== undefined && { company: dto.company }),
        ...(dto.street !== undefined && { street: dto.street }),
        ...(dto.street2 !== undefined && { street2: dto.street2 }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.state !== undefined && { state: dto.state }),
        ...(dto.zip !== undefined && { zip: dto.zip }),
        ...(dto.delivery_instructions !== undefined && { delivery_instructions: dto.delivery_instructions }),
      },
    });
  }

  /**
   * Delete an address. Hard delete because the customer expects it to
   * disappear. If the address was linked to orders, those orders keep
   * their snapshot (line_items + shipping_address_id) — the FK uses
   * onDelete: SetNull so the order's shipping_address_id becomes null
   * but the order itself survives.
   */
  async deleteAddress(customerId: string, addressId: string) {
    await this.assertAddressOwnedBy(customerId, addressId);

    await this.commerce.customerAddress.delete({
      where: { id: addressId },
    });

    return { success: true };
  }

  /**
   * Set an address as the default for its type. Enforces the invariant
   * "at most one is_default=true per customer per type" by unsetting all
   * other defaults of the same type in one transaction.
   */
  async setDefaultAddress(customerId: string, addressId: string) {
    const address = await this.assertAddressOwnedBy(customerId, addressId);

    return this.commerce.$transaction([
      // Unset any existing default for this type
      this.commerce.customerAddress.updateMany({
        where: {
          customer_id: customerId,
          type: address.type,
          is_default: true,
        },
        data: { is_default: false },
      }),
      // Set the target as default
      this.commerce.customerAddress.update({
        where: { id: addressId },
        data: { is_default: true },
      }),
    ]);
  }

  private async assertAddressOwnedBy(customerId: string, addressId: string) {
    const address = await this.commerce.customerAddress.findUnique({
      where: { id: addressId },
    });
    if (!address) {
      throw new NotFoundException(`Address ${addressId} not found`);
    }
    if (address.customer_id !== customerId) {
      throw new ForbiddenException('Address does not belong to current customer');
    }
    return address;
  }

  // ─── Payment methods ─────────────────────────────────────────────────────
  //
  // NOTE: no createPaymentMethod here. Creating cards goes through HelcimPay.js
  // in the browser — the customer enters card details into Helcim's hosted
  // iframe, Helcim returns a tokenized reference, and a separate endpoint
  // (planned: POST /payment-methods/from-helcim-token) will persist the
  // token on this customer. Raw card data never touches our backend.

  async listPaymentMethods(customerId: string) {
    return this.commerce.paymentMethod.findMany({
      where: { customer_id: customerId },
      orderBy: [{ is_default: 'desc' }, { created_at: 'asc' }],
    });
  }

  async deletePaymentMethod(customerId: string, paymentMethodId: string) {
    await this.assertPaymentMethodOwnedBy(customerId, paymentMethodId);

    await this.commerce.paymentMethod.delete({
      where: { id: paymentMethodId },
    });

    return { success: true };
  }

  /**
   * Set a payment method as the default. At most one default per
   * customer, enforced via transaction.
   */
  async setDefaultPaymentMethod(customerId: string, paymentMethodId: string) {
    await this.assertPaymentMethodOwnedBy(customerId, paymentMethodId);

    return this.commerce.$transaction([
      this.commerce.paymentMethod.updateMany({
        where: { customer_id: customerId, is_default: true },
        data: { is_default: false },
      }),
      this.commerce.paymentMethod.update({
        where: { id: paymentMethodId },
        data: { is_default: true },
      }),
    ]);
  }

  private async assertPaymentMethodOwnedBy(customerId: string, paymentMethodId: string) {
    const method = await this.commerce.paymentMethod.findUnique({
      where: { id: paymentMethodId },
    });
    if (!method) {
      throw new NotFoundException(`Payment method ${paymentMethodId} not found`);
    }
    if (method.customer_id !== customerId) {
      throw new ForbiddenException('Payment method does not belong to current customer');
    }
    return method;
  }
}
