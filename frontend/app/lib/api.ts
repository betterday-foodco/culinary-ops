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

  return res.json() as Promise<T>;
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

  getMeal: (id: string) => request<MealRecipe>(`/meals/${id}`),

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

  // Meal component CRUD
  addMealComponent: (mealId: string, data: { ingredient_id?: string; sub_recipe_id?: string; quantity: number; unit: string }) =>
    request<any>(`/meals/${mealId}/components`, { method: 'POST', body: JSON.stringify(data) }),

  updateMealComponent: (mealId: string, componentId: string, data: { quantity?: number; unit?: string }) =>
    request<any>(`/meals/${mealId}/components/${componentId}`, { method: 'PATCH', body: JSON.stringify(data) }),

  removeMealComponent: (mealId: string, componentId: string) =>
    request<void>(`/meals/${mealId}/components/${componentId}`, { method: 'DELETE' }),

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
  getKitchenBoard: () => request<KitchenBoardResponse>('/kitchen-portal/board'),

  upsertProductionLog: (data: {
    plan_id: string;
    sub_recipe_id: string;
    status: 'not_started' | 'in_progress' | 'done';
    qty_cooked?: number;
    weight_recorded?: number;
    notes?: string;
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
  name: string;
  display_name: string;
  final_yield_weight: number;
  pricing_override: number | null;
  computed_cost: number;
  created_at: string;
  updated_at: string;
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
}

export interface PlanSubRecipeRow {
  id: string;
  name: string;
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

// ─── Auth User ────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  name: string | null;
  station: string | null;
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
  status: 'not_started' | 'in_progress' | 'done';
  qty_cooked: number | null;
  weight_recorded: number | null;
  notes: string | null;
  logged_at: string;
  updated_at: string;
}

export interface KitchenFeedback {
  id: string;
  sub_recipe_id: string;
  user_id: string;
  plan_id: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
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
  priority: number;
  instructions: string | null;
  base_yield_weight: number;
  base_yield_unit: string;
  total_quantity: number;
  unit: string;
  scale_factor: number;
  ingredients: PlanSubRecipeIngredient[];
  log: {
    status: 'not_started' | 'in_progress' | 'done';
    qty_cooked: number | null;
    weight_recorded: number | null;
    notes: string | null;
  };
}

export interface KitchenBoardResponse {
  plan: { id: string; week_label: string; week_start: string } | null;
  tasks: KitchenTask[];
  pendingRequests: StationRequest[];
}
