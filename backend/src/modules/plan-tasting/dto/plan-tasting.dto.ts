export class UpsertTastingSessionDto {
  plan_id: string;
  meal_id: string;
  taster_name?: string;
  tasting_notes?: string;
  checked_steps?: number[];
}

export class UpsertWeekNoteDto {
  plan_id: string;
  heading?: string;
  notes?: string;
}
