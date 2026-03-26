import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsBoolean,
  ValidateNested,
  Min,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

export class MealComponentDto {
  @IsOptional()
  @IsUUID()
  ingredient_id?: string;

  @IsOptional()
  @IsUUID()
  sub_recipe_id?: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsString()
  unit: string;
}

export class AddMealComponentDto {
  @IsOptional()
  @IsUUID()
  ingredient_id?: string;

  @IsOptional()
  @IsUUID()
  sub_recipe_id?: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsString()
  unit: string;
}

export class UpdateMealComponentDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsString()
  unit?: string;
}

export class CreateMealDto {
  @IsString()
  name: string;

  @IsString()
  display_name: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  final_yield_weight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pricing_override?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergen_tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dislikes?: string[];

  @IsOptional()
  @IsString()
  heating_instructions?: string;

  @IsOptional()
  @IsString()
  packaging_instructions?: string;

  @IsOptional()
  @IsString()
  cooking_instructions?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  image_url?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  net_weight_kg?: number;

  @IsOptional()
  @IsUUID()
  linked_meal_id?: string | null;

  @IsOptional()
  @IsNumber()
  calories?: number;

  @IsOptional()
  @IsNumber()
  protein_g?: number;

  @IsOptional()
  @IsNumber()
  carbs_g?: number;

  @IsOptional()
  @IsNumber()
  fat_g?: number;

  @IsOptional()
  @IsNumber()
  fiber_g?: number;

  @IsOptional()
  @IsNumber()
  shelf_life_days?: number;

  @IsOptional()
  @IsString()
  label_ingredients?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  protein_types?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dietary_tags?: string[];

  @IsOptional()
  @IsString()
  starch_type?: string;

  @IsOptional()
  @IsString()
  container_type?: string;

  @IsOptional()
  @IsNumber()
  portion_score?: number;

  @IsOptional()
  @IsString()
  short_description?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MealComponentDto)
  components?: MealComponentDto[];
}

export class UpdateMealDto extends PartialType(CreateMealDto) {
  components?: MealComponentDto[];
}
