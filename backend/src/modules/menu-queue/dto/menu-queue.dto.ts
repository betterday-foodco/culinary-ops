import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  Min,
} from 'class-validator';

export class AddToQueueDto {
  @IsString()
  column_id: string;

  @IsString()
  meal_id: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  repeat_weeks?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}

export class UpdateQueueItemDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  repeat_weeks?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  weeks_remaining?: number;
}

export class ReorderColumnDto {
  @IsArray()
  @IsString({ each: true })
  item_ids: string[]; // ordered list — index 0 = position 0
}

export class AdvanceQueueDto {
  @IsOptional()
  @IsString()
  week_label?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
