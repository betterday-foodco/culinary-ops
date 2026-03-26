import { IsString, IsOptional, IsUUID } from 'class-validator';

export class CreateStationTaskDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  station?: string;

  @IsOptional()
  @IsUUID()
  assigned_user_id?: string;

  @IsOptional()
  @IsUUID()
  plan_id?: string;
}
