import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
  Max,
  IsInt,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';

export class SubRecipeComponentDto {
  @IsOptional()
  @IsUUID()
  ingredient_id?: string;

  @IsOptional()
  @IsUUID()
  child_sub_recipe_id?: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsString()
  unit: string;
}

export class CreateSubRecipeDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  display_name?: string;

  @IsString()
  sub_recipe_code: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsString()
  production_day?: string;

  @IsOptional()
  @IsString()
  station_tag?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  priority?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  sub_priority?: number | null;

  @IsNumber()
  @Min(0)
  base_yield_weight: number;

  @IsOptional()
  @IsString()
  base_yield_unit?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubRecipeComponentDto)
  components?: SubRecipeComponentDto[];
}

export class UpdateSubRecipeDto extends PartialType(CreateSubRecipeDto) {}

// ── Individual component add/update ───────────────────────────────────────

export class AddSubRecipeComponentDto {
  @IsOptional()
  @IsUUID()
  ingredient_id?: string;

  @IsOptional()
  @IsUUID()
  child_sub_recipe_id?: string;

  @IsNumber()
  @Min(0)
  quantity: number;

  @IsString()
  unit: string;
}

export class UpdateSubRecipeComponentDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsString()
  unit?: string;
}
