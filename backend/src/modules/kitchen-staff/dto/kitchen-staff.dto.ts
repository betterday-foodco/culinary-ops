import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

const VALID_STATIONS = [
  'Veg Station',
  'Protein Station',
  'Oven Station',
  'Sauce Station',
  'Breakfast + Sides Station',
  'Packaging Station',
];

export class CreateKitchenStaffDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  password: string;

  @IsNotEmpty()
  @IsString()
  station: string;
}

export class UpdateKitchenStaffDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsString()
  station?: string;
}
