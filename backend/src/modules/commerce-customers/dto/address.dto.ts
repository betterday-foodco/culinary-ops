import { IsString, IsOptional, IsEnum, IsEmail, MaxLength } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

/**
 * Valid values for CustomerAddress.type. Must match the AddressType enum
 * in prisma/commerce/schema.prisma.
 */
export enum AddressTypeDto {
  delivery = 'delivery',
  pickup = 'pickup',
}

/**
 * Create a new address on the current customer. All recipient contact
 * fields are REQUIRED because the subscriber-hub-2.0 form collects them
 * as required — an address without a way to reach the recipient is
 * useless for delivery.
 *
 * Recipient fields are distinct from the customer's own profile:
 * when Jose stores Mom's address, recipient_* is Mom's contact info,
 * and customer_id is Jose.
 */
export class CreateAddressDto {
  @IsString()
  @MaxLength(50)
  label: string; // "Home", "Office", "Mom"

  @IsOptional()
  @IsEnum(AddressTypeDto)
  type?: AddressTypeDto; // Defaults to "delivery" if omitted

  @IsString()
  @MaxLength(100)
  recipient_first_name: string;

  @IsString()
  @MaxLength(100)
  recipient_last_name: string;

  @IsEmail()
  recipient_email: string;

  @IsString()
  @MaxLength(30)
  recipient_phone: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;

  @IsString()
  @MaxLength(200)
  street: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  street2?: string; // apt / unit

  @IsString()
  @MaxLength(100)
  city: string;

  @IsString()
  @MaxLength(50)
  state: string;

  @IsString()
  @MaxLength(20)
  zip: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  delivery_instructions?: string;
}

/**
 * PATCH an existing address. Every field optional — only the ones
 * present in the request body are updated. is_default is NOT in this
 * DTO because setting default has its own dedicated endpoint
 * (POST /addresses/:id/default) to enforce the "at most one default
 * per type" invariant atomically in a transaction.
 */
export class UpdateAddressDto extends PartialType(CreateAddressDto) {}
