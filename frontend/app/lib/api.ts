const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token');
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    localStorage.removeItem('access_token');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? 'Request failed');
  }

  // Handle empty responses (e.g. 204 or null returns from NestJS)
  const text = await res.text();
  if (!text) return null as T;
  return JSON.parse(text) as T;
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    request<{ access_token: string; user: AuthUser }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
    ),

  register: (email: string, password: string, role?: string) =>
    request<{ access_token: string; user: AuthUser }>(
      '/auth/register',
      { method: 'POST', body: JSON.stringify({ email, password, role }) },
    ),

  getMe: () => request<AuthUser>('/auth/me'),

  // Ingredients
  getIngredients: (category?: string) =>
    request<Ingredient[]>(`/ingredients${category ? `?category=${category}` : ''}`),

  getIngredient: (id: string) => request<Ingredient>(`/ingredients/${id}`),

  getIngredientCategories: () =>
    request<string[]>('/ingredients/categories'),

  createIngredient: (data: CreateIngredientData) =>
    request<Ingredient>('/ingredients', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateIngredient: (id: string, data: Partial<CreateIngredientData>) =>
    request<Ingredient>(`/ingredients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteIngredient: (id: string) =>
    request<void>(`/ingredients/${id}`, { method: 'DELETE' }),

  // Sub-recipes
  getSubRecipes: (stationTag?: string) =>
    request<SubRecipe[]>(`/sub-recipes${stationTag ? `?station_tag=${stationTag}` : ''}`),

  getSubRecipe: (id: string) => request<SubRecipe>(`/sub-recipes/${id}`),

  getStationTags: () => request<string[]>('/sub-recipes/station-tags'),

  getProductionDays: () => request<string[]>('/sub-recipes/production-days'),

  createSubRecipe: (data: CreateSubRecipeData) =>
    request<SubRecipe>('/sub-recipes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateSubRecipe: (id: string, data: Partial<CreateSubRecipeData>) =>
    request<SubRecipe>(`/sub-recipes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteSubRecipe: (id: string) =>
    request<void>(`/sub-recipes/${id}`, { method: 'DELETE' }),

  // Sub-recipe individual component CRUD
  addSubRecipeComponent: (
    subRecipeId: string,
    data: { ingredient_id?: string; child_sub_recipe_id?: string; quantity: number; unit: string },
  ) =>
    request<any>(`/sub-recipes/${subRecipeId}/components`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateSubRecipeComponent: (
    subRecipeId: string,
    componentId: string,
    data: { quantity?: number; unit?: string },
  ) =>
    request<any>(`/sub-recipes/${subRecipeId}/components/${componentId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  removeSubRecipeComponent: (subRecipeId: string, componentId: string) =>
    request<void>(`/sub-recipes/${subRecipeId}/components/${componentId}`, { method: 'DELETE' }),

  // Meals
  getMeals: () => request<MealRecipe[]>('/meals'),
  searchMeals: (q: string) => request<MealRecipe[]>(`/meals?search=${encodeURIComponent(q)}`),

  getMeal: (id: string) => request<MealRecipe>(`/meals/${id}`),

  getSuggestedVariants: (mealId: string) => request<any[]>(`/meals/${mealId}/suggested-variants`),
  linkMealVariant: (mealId: string, linkedId: string) =>
    request<any>(`/meals/${mealId}/link-variant`, {
      method: 'PATCH',
      body: JSON.stringify({ linked_meal_id: linkedId }),
    }),
  unlinkMealVariant: (mealId: string) =>
    request<any>(`/meals/${mealId}/link-variant`, {
      method: 'PATCH',
      body: JSON.stringify({ linked_meal_id: null }),
    }),

  getMealPricing: () => request<MealPricing[]>('/meals/pricing'),

  createMeal: (data: CreateMealData) =>
    request<MealRecipe>('/meals', { method: 'POST', body: JSON.stringify(data) }),

  updateMeal: (id: string, data: Partial<CreateMealData>) =>
    request<MealRecipe>(`/meals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteMeal: (id: string) =>
    request<void>(`/meals/${id}`, { method: 'DELETE' }),

  backfillMealCodes: () =>
    request<{ updated: number }>('/meals/backfill-codes', { method: 'POST' }),

  // Meal component CRUD
  addMealComponent: (mealId: string, data: { ingredient_id?: string; sub_recipe_id?: string; quantity: number; unit: string }) =>
    request<any>(`/meals/${mealId}/components`, { method: 'POST', body: JSON.stringify(data) }),

  updateMealComponent: (mealId: string, componentId: string, data: { quantity?: number; unit?: string }) =>
    request<any>(`/meals/${mealId}/components/${componentId}`, { method: 'PATCH', body: JSON.stringify(data) }),

  removeMealComponent: (mealId: string, componentId: string) =>
    request<void>(`/meals/${mealId}/components/${componentId}`, { method: 'DELETE' }),

  uploadMealPhoto: (mealId: string, file: File) => {
    const token = getToken();
    const formData = new FormData();
    formData.append('photo', file);
    return fetch(`${API_URL}/meals/${mealId}/photo`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message ?? 'Upload failed');
      }
      return res.json() as Promise<{ id: string; image_url: string }>;
    });
  },

  uploadSpecPhoto: (specId: string, file: File) => {
    const token = getToken();
    const formData = new FormData();
    formData.append('photo', file);
    return fetch(`${API_URL}/portion-specs/${specId}/photo`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message ?? 'Upload failed');
      }
      return res.json() as Promise<{ photo_url: string }>;
    });
  },

  // Orders
  getOrders: (startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.set('start_date', startDate);
    if (endDate) params.set('end_date', endDate);
    const qs = params.toString();
    return request<Order[]>(`/orders${qs ? `?${qs}` : ''}`);
  },

  createOrder: (data: CreateOrderData) =>
    request<Order>('/orders', { method: 'POST', body: JSON.stringify(data) }),

  deleteOrder: (id: string) =>
    request<void>(`/orders/${id}`, { method: 'DELETE' }),

  // Production reports
  getProductionReport: (startDate: string, endDate: string) =>
    request<ProductionReport[]>(
      `/production/report?start_date=${startDate}&end_date=${endDate}`,
    ),

  getMealsReport: (startDate: string, endDate: string) =>
    request<MealRequirement[]>(
      `/production/meals-report?start_date=${startDate}&end_date=${endDate}`,
    ),

  getSubRecipesReport: (startDate: string, endDate: string) =>
    request<SubRecipeRequirement[]>(
      `/production/sub-recipes-report?start_date=${startDate}&end_date=${endDate}`,
    ),

  getShoppingList: (startDate: string, endDate: string) =>
    request<IngredientRequirement[]>(
      `/production/shopping-list?start_date=${startDate}&end_date=${endDate}`,
    ),

  recalculateCosts: () =>
    request<{ subRecipes: number; meals: number }>('/production/recalculate-costs', {
      method: 'POST',
    }),

  // Production Plans
  getProductionPlans: () => request<ProductionPlan[]>('/production-plans'),

  getProductionPlan: (id: string) => request<ProductionPlanDetail>(`/production-plans/${id}`),

  createProductionPlan: (data: {
    week_label: string;
    week_start: string;
    notes?: string;
    items?: { meal_id: string; quantity: number }[];
  }) => request<ProductionPlan>('/production-plans', { method: 'POST', body: JSON.stringify(data) }),

  updateProductionPlan: (id: string, data: {
    week_label?: string;
    week_start?: string;
    status?: string;
    notes?: string;
    items?: { meal_id: string; quantity: number }[];
  }) => request<ProductionPlanDetail>(`/production-plans/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  publishProductionPlan: (id: string, publish: boolean) =>
    request<ProductionPlan>(`/production-plans/${id}/publish`, {
      method: 'PATCH',
      body: JSON.stringify({ publish }),
    }),

  publishProductionPlanCorporate: (id: string, publish: boolean) =>
    request<ProductionPlan>(`/production-plans/${id}/publish-corporate`, {
      method: 'PATCH',
      body: JSON.stringify({ publish }),
    }),

  deleteProductionPlan: (id: string) =>
    request<void>(`/production-plans/${id}`, { method: 'DELETE' }),

  getProductionPlanSubRecipeReport: (id: string) =>
    request<PlanSubRecipeReport>(`/production-plans/${id}/sub-recipe-report`),

  getProductionPlanShoppingList: (id: string) =>
    request<PlanShoppingListReport>(`/production-plans/${id}/shopping-list`),

  getCurrentProductionPlan: () =>
    request<ProductionPlan | null>('/production-plans/current'),

  // Inventory
  getInventoryReport: (planId: string) =>
    request<InventoryReport>(`/ingredients/inventory?plan_id=${planId}`),

  updateIngredientStockBulk: (updates: { id: string; stock: number }[]) =>
    request<{ updated: number }>('/ingredients/stock-bulk', {
      method: 'PATCH',
      body: JSON.stringify({ updates }),
    }),

  // Kitchen Staff (admin only)
  getKitchenStaff: () => request<KitchenStaff[]>('/kitchen-staff'),

  createKitchenStaff: (data: CreateKitchenStaffData) =>
    request<KitchenStaff>('/kitchen-staff', { method: 'POST', body: JSON.stringify(data) }),

  updateKitchenStaff: (id: string, data: Partial<CreateKitchenStaffData>) =>
    request<KitchenStaff>(`/kitchen-staff/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteKitchenStaff: (id: string) =>
    request<{ message: string }>(`/kitchen-staff/${id}`, { method: 'DELETE' }),

  // Kitchen Portal (kitchen / admin)
  getKitchenStaffNames: () =>
    request<{ id: string; name: string | null; station: string | null }[]>('/kitchen-portal/staff'),

  getKitchenBoard: (station?: string) =>
    request<KitchenBoardResponse>(
      `/kitchen-portal/board${station ? `?station=${encodeURIComponent(station)}` : ''}`,
    ),

  upsertProductionLog: (data: {
    plan_id: string;
    sub_recipe_id: string;
    status: 'not_started' | 'in_progress' | 'done' | 'short' | 'bulk';
    qty_cooked?: number;
    weight_recorded?: number;
    have_on_hand?: number;
    notes?: string;
    cooked_by?: string;
    bulk_reason?: string;
    started_at?: string;
  }) =>
    request<KitchenProductionLog>('/kitchen-portal/logs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  submitKitchenFeedback: (data: {
    sub_recipe_id: string;
    plan_id?: string;
    rating: number;
    comment?: string;
  }) =>
    request<KitchenFeedback>('/kitchen-portal/feedback', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getAllKitchenFeedback: () =>
    request<KitchenFeedback[]>('/kitchen-portal/feedback/all'),

  updateKitchenFeedback: (id: string, data: { admin_notes?: string; is_fixed?: boolean }) =>
    request<KitchenFeedback>(`/kitchen-portal/feedback/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  getStationRequests: () =>
    request<{ incoming: StationRequest[]; sent: StationRequest[] }>('/kitchen-portal/requests'),

  createStationRequest: (data: {
    to_station: string;
    description: string;
    quantity?: number;
    unit?: string;
    sub_recipe_id?: string;
    plan_id?: string;
  }) =>
    request<StationRequest>('/kitchen-portal/requests', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateStationRequestStatus: (id: string, status: 'acknowledged' | 'completed') =>
    request<StationRequest>(`/kitchen-portal/requests/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  // Kitchen Messaging
  getKitchenMessages: () =>
    request<KitchenMessage[]>('/kitchen-portal/messages'),

  sendKitchenMessage: (data: { body: string; to_station?: string; to_user_id?: string }) =>
    request<KitchenMessage>('/kitchen-portal/messages', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  markKitchenMessagesRead: () =>
    request<{ ok: boolean }>('/kitchen-portal/messages/read', { method: 'POST' }),

  getKitchenUnreadCount: () =>
    request<{ unread: number }>('/kitchen-portal/messages/unread'),

  // Shortage Approval (admin)
  getPendingShortages: () =>
    request<ShortageLog[]>('/kitchen-portal/shortages'),

  approveShortage: (logId: string) =>
    request<KitchenProductionLog>(`/kitchen-portal/shortages/${logId}/approve`, { method: 'PATCH' }),

  // Bulk Cooking Approval (admin)
  getPendingBulk: () =>
    request<BulkLog[]>('/kitchen-portal/bulk'),

  approveBulk: (logId: string) =>
    request<KitchenProductionLog>(`/kitchen-portal/bulk/${logId}/approve`, { method: 'PATCH' }),

  // Admin: all messages
  getAllKitchenMessages: () =>
    request<KitchenMessage[]>('/kitchen-portal/messages/all'),

  // Station Assignment (admin)
  getStationAssignment: () =>
    request<StaffAssignment[]>('/kitchen-portal/station-assignment'),

  assignStation: (staffId: string, station: string | null) =>
    request<StaffAssignment>(
      `/kitchen-portal/station-assignment/${staffId}`,
      { method: 'PATCH', body: JSON.stringify({ station }) },
    ),

  assignStationRole: (staffId: string, station_role: string | null) =>
    request<StaffAssignment>(
      `/kitchen-portal/station-assignment/${staffId}/role`,
      { method: 'PATCH', body: JSON.stringify({ station_role }) },
    ),

  getStationPrepCooks: (station: string) =>
    request<{ id: string; name: string | null; station_role: string | null }[]>(
      `/kitchen-portal/station-prep-cooks?station=${encodeURIComponent(station)}`
    ),

  assignKitchenTask: (planId: string, subRecipeId: string, assignedToId: string | null) =>
    request<{ count: number }>('/kitchen-portal/tasks/assign', {
      method: 'PATCH',
      body: JSON.stringify({ plan_id: planId, sub_recipe_id: subRecipeId, assigned_to_id: assignedToId }),
    }),

  leadApproveTask: (planId: string, subRecipeId: string) =>
    request<{ count: number }>('/kitchen-portal/tasks/lead-approve', {
      method: 'PATCH',
      body: JSON.stringify({ plan_id: planId, sub_recipe_id: subRecipeId }),
    }),

  updateSubRecipePriority: (subRecipeId: string, priority: number) =>
    request<{ id: string; priority: number }>(`/kitchen-portal/sub-recipes/${subRecipeId}/priority`, {
      method: 'PATCH',
      body: JSON.stringify({ priority }),
    }),

  // Menu Queue
  getMenuQueue: () => request<MenuQueueResponse>('/menu-queues'),

  addToQueue: (data: { column_id: string; meal_id: string; repeat_weeks?: number; position?: number }) =>
    request<MenuQueueItem>('/menu-queues/items', { method: 'POST', body: JSON.stringify(data) }),

  updateQueueItem: (id: string, data: { repeat_weeks?: number; weeks_remaining?: number }) =>
    request<MenuQueueItem>(`/menu-queues/items/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  removeFromQueue: (id: string) =>
    request<{ message: string }>(`/menu-queues/items/${id}`, { method: 'DELETE' }),

  reorderQueueColumn: (columnId: string, item_ids: string[]) =>
    request<MenuQueueResponse>(`/menu-queues/columns/${columnId}/reorder`, {
      method: 'POST',
      body: JSON.stringify({ item_ids }),
    }),

  advanceMenuQueue: (data?: { week_label?: string; notes?: string }) =>
    request<{ message: string; log: MenuAdvanceLog; queue: MenuQueueResponse }>('/menu-queues/advance', {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    }),

  getLastAdvanced: () => request<MenuAdvanceLog | null>('/menu-queues/last-advanced'),

  // Station Tasks
  listStationTasks: (planId?: string) =>
    request<StationTask[]>(`/station-tasks${planId ? `?plan_id=${planId}` : ''}`),

  createStationTask: (data: { title: string; description?: string; station?: string; assigned_user_id?: string; plan_id?: string }) =>
    request<StationTask>('/station-tasks', { method: 'POST', body: JSON.stringify(data) }),

  completeStationTask: (id: string) =>
    request<StationTask>(`/station-tasks/${id}/complete`, { method: 'PATCH' }),

  uncompleteStationTask: (id: string) =>
    request<StationTask>(`/station-tasks/${id}/uncomplete`, { method: 'PATCH' }),

  deleteStationTask: (id: string) =>
    request<{ message: string }>(`/station-tasks/${id}`, { method: 'DELETE' }),

  // Portion Specs
  getPortionSpecs: () => request<PortionSpec[]>('/portion-specs'),

  getPortionSpecByMeal: (mealId: string) =>
    request<PortionSpec | null>(`/portion-specs/${mealId}`).catch(() => null),

  getPortionSpecsByPlan: (planId: string) =>
    request<PortionSpec[]>(`/portion-specs/by-plan/${planId}`),

  upsertPortionSpec: (data: UpsertPortionSpecData) =>
    request<PortionSpec>('/portion-specs', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updatePortionSpec: (id: string, data: Partial<UpsertPortionSpecData>) =>
    request<PortionSpec>(`/portion-specs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deletePortionSpec: (id: string) =>
    request<void>(`/portion-specs/${id}`, { method: 'DELETE' }),

  // Plan tasting
  getTastingSessions: (planId: string) => request<any[]>(`/plan-tasting/${planId}/sessions`),
  upsertTastingSession: (data: { plan_id: string; meal_id: string; taster_name?: string; tasting_notes?: string; checked_steps?: number[] }) =>
    request<any>('/plan-tasting/sessions', { method: 'POST', body: JSON.stringify(data) }),
  getWeekNote: (planId: string) => request<{ heading?: string; notes?: string } | null>(`/plan-tasting/${planId}/week-note`).catch(() => null),
  upsertWeekNote: (data: { plan_id: string; heading?: string; notes?: string }) =>
    request<any>('/plan-tasting/week-note', { method: 'POST', body: JSON.stringify(data) }),

  // Production Numbers (Wed/Thu tracking + shortage alerts)
  getProductionNumbers: (planId: string) =>
    request<any[]>(`/production-numbers/${planId}`),

  getProductionShortages: (planId: string) =>
    request<any[]>(`/production-numbers/${planId}/shortages`),

  updateThursdayNumber: (planId: string, subRecipeId: string, qty: number) =>
    request<any>(`/production-numbers/${planId}/${subRecipeId}/thursday`, {
      method: 'PATCH',
      body: JSON.stringify({ qty }),
    }),

  bulkSetWednesdayNumbers: (planId: string, entries: Array<{ sub_recipe_id: string; qty: number; unit?: string }>) =>
    request<any>(`/production-numbers/${planId}/wednesday`, {
      method: 'POST',
      body: JSON.stringify({ entries }),
    }),

  // System Tags
  getTags: () => request<any[]>('/tags'),
  seedTags: () => request<any>('/tags/seed', { method: 'POST' }),
  createTag: (data: any) => request<any>('/tags', { method: 'POST', body: JSON.stringify(data) }),
  updateTag: (id: string, data: any) => request<any>(`/tags/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTag: (id: string) => request<void>(`/tags/${id}`, { method: 'DELETE' }),

  // Daily Checklist
  getDailyChecklist: (day?: string) =>
    request<any[]>(`/daily-checklist${day ? `?day=${day}` : ''}`),
  seedDailyChecklist: () =>
    request<any>('/daily-checklist/seed', { method: 'POST' }),
  createDailyChecklistItem: (data: { title: string; day: string; station?: string; sort_order?: number }) =>
    request<any>('/daily-checklist', { method: 'POST', body: JSON.stringify(data) }),
  updateDailyChecklistItem: (id: string, data: any) =>
    request<any>(`/daily-checklist/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteDailyChecklistItem: (id: string) =>
    request<any>(`/daily-checklist/${id}`, { method: 'DELETE' }),
  toggleDailyChecklist: (id: string, weekLabel: string, completedBy?: string) =>
    request<any>(`/daily-checklist/${id}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ week_label: weekLabel, completed_by: completedBy }),
    }),

  // Kitchen Stations
  getKitchenStations: () => request<any[]>('/kitchen-stations'),
  seedKitchenStations: () => request<any>('/kitchen-stations/seed', { method: 'POST' }),
  createKitchenStation: (data: { name: string; sort_order?: number }) =>
    request<any>('/kitchen-stations', { method: 'POST', body: JSON.stringify(data) }),
  updateKitchenStation: (id: string, data: any) =>
    request<any>(`/kitchen-stations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteKitchenStation: (id: string) =>
    request<any>(`/kitchen-stations/${id}`, { method: 'DELETE' }),

  // Admin: update production log (fix qty)
  updateProductionLog: (logId: string, data: { qty_cooked?: number; notes?: string }) =>
    request<any>(`/kitchen-portal/logs/${logId}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Integration / MealPrep platform
  getIntegrationConfig: () => request<{
    mealprep_api_endpoint: string;
    mealprep_api_token_set: boolean;
    mealprep_webhook_secret_set: boolean;
    mealprep_webhook_url_hint: string;
  }>('/mealprep-sync/config'),
  saveIntegrationConfig: (data: Record<string, string>) =>
    request<{ ok: boolean }>('/system-config', { method: 'PATCH', body: JSON.stringify(data) }),
  publishToMealPrep: (planId: string) =>
    request<any>(`/mealprep-sync/publish/${planId}`, { method: 'POST' }),
  getWebhookLogs: () => request<any[]>('/webhooks/logs'),

  // BD Admin — Corporate Management (admin role only)
  bdGetAllCompanies: () =>
    request<{ ok: boolean; companies: BdCompany[] }>('/corp-admin/companies'),
  bdUpsertCompany: (data: Partial<BdCompany> & { id?: string }) =>
    request<{ ok: boolean; company: BdCompany }>('/corp-admin/companies', {
      method: 'POST', body: JSON.stringify(data),
    }),
  bdUpsertEmployee: (data: { id?: string; company_id: string; name: string; email: string; role?: string; employee_code?: string }) =>
    request<{ ok: boolean; employee: BdEmployee }>('/corp-admin/employees', {
      method: 'POST', body: JSON.stringify(data),
    }),
  bdUpdateCompanyPin: (companyId: string, pin: string) =>
    request<{ ok: boolean }>(`/corp-admin/companies/${companyId}/pin`, {
      method: 'PATCH', body: JSON.stringify({ pin }),
    }),
  bdGetCompanyEmployees: (companyId: string) =>
    request<{ ok: boolean; employees: BdEmployee[] }>(`/corp-admin/companies/${companyId}/employees`),
  bdGetCompanyDashboard: (companyId: string) =>
    request<BdCompanyDashboard>(`/corp-admin/companies/${companyId}/dashboard`),
  bdGetCompanyOrders: (companyId: string, limit?: number) =>
    request<{ ok: boolean; orders: BdOrder[] }>(`/corp-admin/companies/${companyId}/orders${limit ? `?limit=${limit}` : ''}`),
  bdGetCompanyInvoices: (companyId: string) =>
    request<{ ok: boolean; invoices: BdInvoice[] }>(`/corp-admin/companies/${companyId}/invoices`),

  // Corporate Sync
  getCorporateOrders: (week?: string) =>
    request<CorporateOrderSummary>(`/corporate-sync/orders${week ? `?week=${week}` : ''}`),
  applyCorporateOrdersToPlan: (planId: string, week?: string) =>
    request<CorporateApplyResult>(`/corporate-sync/apply/${planId}${week ? `?week=${week}` : ''}`, { method: 'POST' }),
  publishMenuToCorporate: (planId: string) =>
    request<{ ok: boolean; week: string; meals_published: number }>(`/corporate-sync/publish-menu/${planId}`, { method: 'POST' }),
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Ingredient {
  id: string;
  internal_name: string;
  display_name: string;
  sku: string;
  category: string;
  location: string | null;
  supplier_name: string | null;
  trim_percentage: number;
  base_weight: number;
  cost_per_unit: number;
  unit: string;
  stock: number;
  allergen_tags: string[];
  created_at: string;
  updated_at: string;
}

export type CreateIngredientData = Omit<Ingredient, 'id' | 'created_at' | 'updated_at' | 'stock' | 'unit'> & {
  unit?: string;   // defaults to "Kgs" on backend
  stock?: number;  // defaults to 0 on backend
};

export interface SubRecipeComponent {
  id: string;
  ingredient_id: string | null;
  child_sub_recipe_id: string | null;
  quantity: number;
  unit: string;
  ingredient?: Pick<Ingredient, 'id' | 'internal_name' | 'sku'> | null;
  child_sub_recipe?: Pick<SubRecipe, 'id' | 'name' | 'sub_recipe_code'> | null;
}

export interface SubRecipe {
  id: string;
  name: string;
  sub_recipe_code: string;
  instructions: string | null;
  production_day: string | null;
  station_tag: string | null;
  base_yield_weight: number;
  computed_cost: number;
  created_at: string;
  updated_at: string;
  components: SubRecipeComponent[];
}

export interface CreateSubRecipeData {
  name: string;
  sub_recipe_code: string;
  instructions?: string;
  production_day?: string;
  station_tag?: string;
  base_yield_weight: number;
  components?: { ingredient_id?: string; child_sub_recipe_id?: string; quantity: number; unit: string }[];
}

export interface MealComponent {
  id: string;
  ingredient_id: string | null;
  sub_recipe_id: string | null;
  quantity: number;
  unit: string;
  ingredient?: Pick<Ingredient, 'id' | 'internal_name' | 'sku'> | null;
  sub_recipe?: Pick<SubRecipe, 'id' | 'name' | 'sub_recipe_code'> | null;
}

export interface MealRecipe {
  id: string;
  meal_code: string | null;
  name: string;
  display_name: string;
  category: string | null;
  is_active: boolean;
  final_yield_weight: number;
  pricing_override: number | null;
  computed_cost: number;
  short_description: string | null;
  description: string | null;
  image_url: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  created_at: string;
  updated_at: string;
  allergen_tags: string[];
  dietary_tags: string[];
  linked_meal_id: string | null;
  portion_score: number | null;
  components: MealComponent[];
}

export interface MealPricing {
  id: string;
  name: string;
  display_name: string;
  computed_cost: number;
  pricing_override: number | null;
  final_yield_weight: number;
}

export interface CreateMealData {
  name: string;
  display_name: string;
  final_yield_weight: number;
  pricing_override?: number;
  components?: { ingredient_id?: string; sub_recipe_id?: string; quantity: number; unit: string }[];
}

export interface Order {
  id: string;
  external_order_id: string;
  meal_id: string;
  quantity: number;
  production_date: string;
  source_platform: string;
  created_at: string;
  meal?: Pick<MealRecipe, 'id' | 'name' | 'display_name'>;
}

export interface CreateOrderData {
  external_order_id: string;
  meal_id: string;
  quantity: number;
  production_date: string;
  source_platform?: string;
}

export interface MealRequirement {
  meal_id: string;
  meal_name: string;
  display_name: string;
  total_quantity: number;
}

export interface SubRecipeRequirement {
  id: string;
  name: string;
  sub_recipe_code: string;
  station_tag: string | null;
  production_day: string | null;
  total_quantity: number;
  unit: string;
}

export interface IngredientRequirement {
  id: string;
  internal_name: string;
  display_name: string;
  sku: string;
  category: string;
  supplier_name: string | null;
  location: string | null;
  total_quantity: number;
  unit: string;
  allergen_tags: string[];
}

export interface ProductionReport {
  production_date: string;
  meals: MealRequirement[];
  sub_recipes: SubRecipeRequirement[];
  ingredients: IngredientRequirement[];
  grouped_by_station: Record<string, SubRecipeRequirement[]>;
  grouped_by_day: Record<string, SubRecipeRequirement[]>;
}

// ─── New endpoints added ─────────────────────────────────────────────────────

// Extend api object — appended separately so existing code is unaffected
export const apiExtra = {
  // Sub-recipe prep sheet (no orders needed)
  getPrepSheet: (station?: string, day?: string) => {
    const params = new URLSearchParams();
    if (station) params.set('station', station);
    if (day) params.set('day', day);
    const qs = params.toString();
    return request<Record<string, PrepSheetSubRecipe[]>>(`/sub-recipes/prep-sheet${qs ? `?${qs}` : ''}`);
  },

  getProductionDays: () => request<string[]>('/sub-recipes/production-days'),

  // Meal cooking sheet (no orders needed)
  getCookingSheet: (category?: string) => {
    const qs = category ? `?category=${encodeURIComponent(category)}` : '';
    return request<CookingSheetMeal[]>(`/meals/cooking-sheet${qs}`);
  },

  getMealCategories: () => request<string[]>('/meals/categories'),
};

// ─── New types ────────────────────────────────────────────────────────────────

export interface PrepSheetComponent {
  id: string;
  quantity: number;
  unit: string;
  trim_percentage: number;
  ingredient: { id: string; internal_name: string; display_name: string; sku: string; category: string; unit: string } | null;
  child_sub_recipe: { id: string; name: string; sub_recipe_code: string } | null;
}

export interface PrepSheetSubRecipe {
  id: string;
  name: string;
  sub_recipe_code: string;
  station_tag: string | null;
  production_day: string | null;
  priority: number;
  instructions: string | null;
  base_yield_weight: number;
  base_yield_unit: string;
  components: PrepSheetComponent[];
}

export interface CookingSheetMeal {
  id: string;
  name: string;
  display_name: string;
  category: string | null;
  cooking_instructions: string | null;
  heating_instructions: string | null;
  packaging_instructions: string | null;
  allergen_tags: string[];
  pricing_override: number | null;
  computed_cost: number;
  components: {
    id: string;
    quantity: number;
    unit: string;
    ingredient: { id: string; internal_name: string; unit: string } | null;
    sub_recipe: { id: string; name: string; sub_recipe_code: string; station_tag: string | null; instructions: string | null } | null;
  }[];
}

// ─── Production Plan types ────────────────────────────────────────────────────

export interface ProductionPlan {
  id: string;
  week_label: string;
  week_start: string;
  status: string;
  notes: string | null;
  published_to_kitchen: boolean;
  published_to_corporate: boolean;
  created_at: string;
  updated_at: string;
  items: {
    id: string;
    quantity: number;
    meal: { id: string; display_name: string; category: string | null };
  }[];
}

export interface ProductionPlanItem {
  id: string;
  plan_id: string;
  meal_id: string;
  quantity: number;
  meal: {
    id: string;
    name: string;
    display_name: string;
    category: string | null;
    allergen_tags: string[];
    computed_cost: number;
  };
}

export interface ProductionPlanDetail {
  id: string;
  week_label: string;
  week_start: string;
  status: string;
  notes: string | null;
  published_to_kitchen: boolean;
  published_to_corporate: boolean;
  created_at: string;
  updated_at: string;
  items: ProductionPlanItem[];
}

export interface PlanSubRecipeIngredient {
  id: string;
  name: string;
  display_name: string;
  sku: string;
  quantity: number;
  unit: string;
  type: 'ingredient' | 'sub_recipe';
  station_tag?: string | null;
  production_day?: string | null;
  priority?: number | null;
}

export interface PlanSubRecipeRow {
  id: string;
  name: string;
  display_name: string | null;
  sub_recipe_code: string;
  station_tag: string | null;
  production_day: string | null;
  priority: number;
  instructions: string | null;
  base_yield_weight: number;
  base_yield_unit: string;
  total_quantity: number;
  scale_factor: number;
  unit: string;
  meal_breakdown: { meal: string; qty: number }[];
  ingredients: PlanSubRecipeIngredient[];
}

export interface PlanSubRecipeReport {
  plan_id: string;
  week_label: string;
  grouped_by_station: Record<string, PlanSubRecipeRow[]>;
  total_sub_recipes: number;
}

export interface PlanIngredientRow {
  id: string;
  internal_name: string;
  display_name: string;
  sku: string;
  category: string;
  supplier_name: string | null;
  location: string | null;
  total_quantity: number;
  unit: string;
  cost_per_unit: number;
  allergen_tags: string[];
}

export interface PlanShoppingListReport {
  plan_id: string;
  week_label: string;
  grouped_by_category: Record<string, PlanIngredientRow[]>;
  total_ingredients: number;
}

// ─── Inventory types ──────────────────────────────────────────────────────────

export interface InventoryRow {
  id: string;
  internal_name: string;
  display_name: string;
  sku: string;
  category: string;
  supplier_name: string | null;
  location: string | null;
  unit: string;
  base_weight: number;
  cost_per_unit: number;
  stock: number;
  need: number;
  to_order: number;
  cases_to_order: number;
  case_price: number;
  total_cost: number;
  total_cost_buffered: number;
}

export interface InventoryReport {
  plan_id: string;
  week_label: string;
  grouped_by_category: Record<string, InventoryRow[]>;
  total_cost_all: number;
  total_cost_buffered_all: number;
  items_needing_order: number;
}

// ─── Corporate Sync types ────────────────────────────────────────────────────

export interface CorporateMealCount {
  meal_id: string;
  meal_code: string;
  dish_name: string;
  diet: string;
  count: number;
  by_company: { company: string; count: number }[];
  internal_meal_id: string | null;
  internal_meal_name: string | null;
}

export interface CorporateOrderSummary {
  ok: boolean;
  week: string;
  fetched_at: string;
  total_orders: number;
  companies: string[];
  meals: CorporateMealCount[];
}

export interface CorporateApplyResult {
  applied: number;
  skipped: number;
  unmatched: string[];
  summary: CorporateOrderSummary;
}

// ─── Auth User ────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  name: string | null;
  station: string | null;
  station_role: string | null;
}

// ─── Kitchen Staff types ──────────────────────────────────────────────────────

export interface KitchenStaff {
  id: string;
  email: string;
  name: string | null;
  station: string | null;
  role: string;
  created_at: string;
}

export interface CreateKitchenStaffData {
  name: string;
  email: string;
  password: string;
  station: string;
}

// ─── Kitchen Portal types ─────────────────────────────────────────────────────

export interface KitchenProductionLog {
  id: string;
  plan_id: string;
  sub_recipe_id: string;
  user_id: string;
  status: 'not_started' | 'in_progress' | 'done' | 'short' | 'bulk';
  qty_cooked: number | null;
  weight_recorded: number | null;
  have_on_hand: number | null;
  notes: string | null;
  cooked_by: string | null;
  started_at: string | null;
  shortage_approved: boolean;
  shortage_approved_at: string | null;
  shortage_approved_by: { id: string; name: string | null } | null;
  bulk_reason: string | null;
  bulk_approved: boolean;
  bulk_approved_at: string | null;
  bulk_approved_by: { id: string; name: string | null } | null;
  assigned_to_id: string | null;
  assigned_to: { id: string; name: string | null } | null;
  lead_approved: boolean;
  lead_approved_at: string | null;
  logged_at: string;
  updated_at: string;
}

export interface StaffAssignment {
  id: string;
  name: string | null;
  station: string | null;
  station_role: string | null; // 'lead' | 'prep' | null
}

export interface BulkLog {
  id: string;
  plan_id: string;
  sub_recipe_id: string;
  user_id: string;
  status: string;
  qty_cooked: number | null;
  bulk_reason: string | null;
  bulk_approved: boolean;
  logged_at: string;
  sub_recipe: { id: string; name: string; display_name: string | null; station_tag: string | null };
  user: { id: string; name: string | null; station: string | null };
  plan: { id: string; week_label: string };
}

export interface KitchenMessage {
  id: string;
  from_user_id: string;
  to_station: string | null;
  to_user_id: string | null;
  body: string;
  is_read: boolean;
  created_at: string;
  from_user: { id: string; name: string | null; station: string | null; role: string };
  to_user: { id: string; name: string | null; station: string | null } | null;
}

export interface ShortageLog {
  id: string;
  plan_id: string;
  sub_recipe_id: string;
  user_id: string;
  status: string;
  qty_cooked: number | null;
  have_on_hand: number | null;
  shortage_approved: boolean;
  logged_at: string;
  sub_recipe: { id: string; name: string; display_name: string | null; station_tag: string | null };
  user: { id: string; name: string | null; station: string | null };
  plan: { id: string; week_label: string };
}

export interface KitchenFeedback {
  id: string;
  sub_recipe_id: string;
  user_id: string;
  plan_id: string | null;
  rating: number;
  comment: string | null;
  admin_notes: string | null;
  is_fixed: boolean;
  created_at: string;
  updated_at: string;
  sub_recipe?: { id: string; name: string; display_name: string | null; station_tag: string | null };
  user?: { id: string; name: string | null };
}

export interface StationRequest {
  id: string;
  from_user_id: string;
  to_station: string;
  plan_id: string | null;
  sub_recipe_id: string | null;
  description: string;
  quantity: number | null;
  unit: string | null;
  status: 'pending' | 'acknowledged' | 'completed';
  created_at: string;
  updated_at: string;
  from_user?: { id: string; name: string | null; station: string | null };
  sub_recipe?: { id: string; name: string; display_name: string | null } | null;
}

export interface KitchenTask {
  sub_recipe_id: string;
  name: string;
  display_name: string | null;
  sub_recipe_code: string;
  station_tag: string | null;
  production_day: string | null;
  priority: number;
  instructions: string | null;
  base_yield_weight: number;
  base_yield_unit: string;
  total_quantity: number;
  unit: string;
  scale_factor: number;
  ingredients: PlanSubRecipeIngredient[];
  completed_by: string | null;
  log: {
    status: 'not_started' | 'in_progress' | 'done' | 'short' | 'bulk';
    qty_cooked: number | null;
    weight_recorded: number | null;
    have_on_hand: number | null;
    notes: string | null;
    cooked_by: string | null;
    started_at: string | null;
    shortage_approved: boolean;
    shortage_approved_at: string | null;
    shortage_approved_by: { id: string; name: string | null } | null;
    bulk_reason: string | null;
    bulk_approved: boolean;
    bulk_approved_by: { id: string; name: string | null } | null;
    assigned_to_id: string | null;
    assigned_to: { id: string; name: string | null } | null;
    lead_approved: boolean;
    lead_approved_at: string | null;
  };
}

export interface StationTask {
  id: string;
  plan_id: string | null;
  title: string;
  description: string | null;
  station: string | null;
  assigned_user_id: string | null;
  completed_by_id: string | null;
  completed_at: string | null;
  created_by_id: string;
  created_at: string;
  assigned_user?: { id: string; name: string | null; station: string | null } | null;
  completed_by?: { id: string; name: string | null } | null;
  created_by?: { id: string; name: string | null };
}

// ─── Menu Queue types ─────────────────────────────────────────────────────────

export interface QueueColumn {
  id: string;
  label: string;
  type: 'meat' | 'omni' | 'vegan';
}

export interface MenuQueueItem {
  id: string;
  column_id: string;
  meal_id: string;
  position: number;
  repeat_weeks: number;
  weeks_remaining: number;
  created_at: string;
  updated_at: string;
  meal: {
    id: string;
    name: string;
    display_name: string;
    category: string | null;
    allergen_tags: string[];
    dietary_tags: string[];
    computed_cost: number;
    image_url: string | null;
    meal_code: string | null;
    linked_meal_id: string | null;
    portion_score: number | null;
  };
}

export interface MenuQueueResponse {
  columns: QueueColumn[];
  queue: Record<string, MenuQueueItem[]>; // keyed by column_id
}

export interface MenuAdvanceLog {
  id: string;
  advanced_at: string;
  week_label: string | null;
  notes: string | null;
}

export interface KitchenBoardResponse {
  plan: { id: string; week_label: string; week_start: string; published_to_kitchen?: boolean } | null;
  tasks: KitchenTask[];
  pendingRequests: StationRequest[];
  stationTasks?: StationTask[];
  notPublished?: boolean;
}

// ─── Portion Specs types ───────────────────────────────────────────────────────

export interface PortionSpecComponent {
  id: string;
  spec_id: string;
  ingredient_name: string;
  portion_min: number | null;
  portion_max: number | null;
  portion_unit: string | null;
  tool: string | null;
  notes: string | null;
  sort_order: number;
}

export interface PortionSpec {
  id: string;
  meal_id: string;
  container_type: string | null;
  total_weight_min: number | null;
  total_weight_max: number | null;
  general_notes: string | null;
  tasting_notes: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
  meal?: {
    id: string;
    meal_code: string | null;
    display_name: string;
    image_url: string | null;
    category: string | null;
  };
  components: PortionSpecComponent[];
}

export interface UpsertPortionSpecData {
  meal_id: string;
  container_type?: string;
  total_weight_min?: number;
  total_weight_max?: number;
  general_notes?: string;
  tasting_notes?: string;
  components?: {
    ingredient_name: string;
    portion_min?: number;
    portion_max?: number;
    portion_unit?: string;
    tool?: string;
    notes?: string;
    sort_order?: number;
  }[];
}

// ─── BD Admin / Corporate types ───────────────────────────────────────────────

export interface BdCompany {
  id: string;
  name: string;
  delivery_day: string | null;
  contact_email: string | null;
  contact_name: string | null;
  is_active: boolean;
  extra: Record<string, unknown> | null;
  _count?: { employees: number; orders: number };
}

export interface BdEmployee {
  id: string;
  company_id: string;
  employee_code: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

export interface BdCompanyDashboard {
  ok: boolean;
  company: {
    id: string;
    name: string;
    delivery_day: string | null;
    employee_count: number;
    par_levels: { category_name: string; max_meals_week: number }[];
    extra: Record<string, unknown> | null;
  };
  recent_orders: number;
  totals: { employee: number; company: number; bd: number; meals: number };
}

export interface BdOrder {
  id: string;
  order_code: string;
  status: string;
  delivery_date: string | null;
  created_at: string;
  employee_cost: number;
  company_cost: number;
  bd_cost: number;
  employee: { name: string; email: string; employee_code: string } | null;
  items: {
    id: string;
    meal_name: string;
    quantity: number;
    unit_price_employee: number;
    unit_price_company: number;
    meal_recipe: { display_name: string; category: string | null } | null;
  }[];
}

export interface BdInvoice {
  id: string;
  invoice_number: string;
  period_start: string;
  period_end: string;
  total_amount: number;
  status: string;
  pdf_url: string | null;
  created_at: string;
}

