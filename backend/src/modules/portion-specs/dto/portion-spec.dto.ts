import { IsOptional, IsString, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePortionSpecComponentDto {
  @IsString()
  ingredient_name: string;

  @IsOptional() @IsNumber()
  portion_min?: number;

  @IsOptional() @IsNumber()
  portion_max?: number;

  @IsOptional() @IsString()
  portion_unit?: string;

  @IsOptional() @IsString()
  tool?: string;

  @IsOptional() @IsString()
  notes?: string;

  @IsOptional() @IsNumber()
  sort_order?: number;
}

export class CreatePortionSpecDto {
  @IsString()
  meal_id: string;

  @IsOptional() @IsString()
  container_type?: string;

  @IsOptional() @IsNumber()
  total_weight_min?: number;

  @IsOptional() @IsNumber()
  total_weight_max?: number;

  @IsOptional() @IsString()
  general_notes?: string;

  @IsOptional() @IsString()
  tasting_notes?: string;

  @IsOptional() @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePortionSpecComponentDto)
  components?: CreatePortionSpecComponentDto[];
}

export class UpdatePortionSpecDto {
  @IsOptional() @IsString()
  container_type?: string;

  @IsOptional() @IsNumber()
  total_weight_min?: number;

  @IsOptional() @IsNumber()
  total_weight_max?: number;

  @IsOptional() @IsString()
  general_notes?: string;

  @IsOptional() @IsString()
  tasting_notes?: string;

  @IsOptional() @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePortionSpecComponentDto)
  components?: CreatePortionSpecComponentDto[];
}
