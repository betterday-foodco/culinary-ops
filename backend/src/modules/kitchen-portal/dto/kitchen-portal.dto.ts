import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class UpsertProductionLogDto {
  @IsUUID()
  plan_id: string;

  @IsUUID()
  sub_recipe_id: string;

  @IsEnum(['not_started', 'in_progress', 'done', 'short', 'bulk'])
  status: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  qty_cooked?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weight_recorded?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  have_on_hand?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  cooked_by?: string;

  @IsOptional()
  @IsString()
  bulk_reason?: string;

  @IsOptional()
  started_at?: string; // ISO date string — set when status first becomes in_progress
}

export class SendMessageDto {
  @IsNotEmpty()
  @IsString()
  body: string;

  @IsOptional()
  @IsString()
  to_station?: string; // null = broadcast to all kitchen

  @IsOptional()
  @IsUUID()
  to_user_id?: string; // direct message to a specific user
}

export class SubmitFeedbackDto {
  @IsUUID()
  sub_recipe_id: string;

  @IsOptional()
  @IsUUID()
  plan_id?: string;

  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class CreateStationRequestDto {
  @IsNotEmpty()
  @IsString()
  to_station: string;

  @IsNotEmpty()
  @IsString()
  description: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsUUID()
  sub_recipe_id?: string;

  @IsOptional()
  @IsUUID()
  plan_id?: string;
}

export class UpdateStationRequestDto {
  @IsEnum(['acknowledged', 'completed'])
  status: string;
}
