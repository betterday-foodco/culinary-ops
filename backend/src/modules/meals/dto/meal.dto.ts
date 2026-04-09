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

  @IsOptional()
  @IsNumber()
  sort_order?: number;

  @IsOptional()
  @IsString()
  portioning_notes?: string;
}

export class CreateMealDto {
  // Legacy admin-only "internal name" used for sorting workarounds in the old
  // SPRWT system (e.g. "[Meat] Chicken Alfredo"). In the new model every dish
  // has a proper diet_plan_id + category for sorting/filtering, so the
  // internal name is no longer required at the UI level. The DB column is
  // still NOT NULL — the service auto-fills it from display_name when the
  // caller omits it, so the capability stays available for fringe cases
  // (surfaced via the "Advanced / Admin" toggle on the meal edit page) but
  // isn't a required field at the create step.
  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  display_name: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  diet_plan_id?: string | null; // uuid of a SystemTag row where type='diets' (Omnivore or Plant-Based). See ADR 2026-04-08.

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
