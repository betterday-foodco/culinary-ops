const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// ── Token storage (separate namespace from culinary tokens) ──────────────────

export function getCorpToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('corp_access_token');
}

export function setCorpToken(token: string, user: CorpUser) {
  localStorage.setItem('corp_access_token', token);
  localStorage.setItem('corp_user', JSON.stringify(user));
}

export function clearCorpAuth() {
  localStorage.removeItem('corp_access_token');
  localStorage.removeItem('corp_user');
}

export function getCorpUser(): CorpUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('corp_user');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface CorpUser {
  id: string;
  email?: string;
  role: 'corp_employee' | 'corp_manager';
  company_id: string;
  name: string | null;
  employee_code?: string;
  type: 'corporate';
}

export interface CorpMeal {
  id: string;
  meal_code: string | null;
  name: string;
  display_name: string;
  category: string | null;
  description: string | null;
  short_description: string | null;
  image_url: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  allergen_tags: string[];
  dietary_tags: string[];
  protein_types: string[];
  heating_instructions: string | null;
  plan_quantity: number;
  pricing: TierPricingConfig;
}

export interface TierPricingConfig {
  free:  { meals: number; employeePrice: number; bdSubsidy: number; companySubsidy: number };
  tier1: { meals: number; employeePrice: number; bdSubsidy: number; companySubsidy: number };
  tier2: { meals: number; employeePrice: number; bdSubsidy: number; companySubsidy: number };
  tier3: { meals: number; employeePrice: number; bdSubsidy: number; companySubsidy: number };
  allow_extra?: boolean;
  full_price: number;
}

export interface WeekMenu {
  week: string | null;
  week_start: string | null;
  plan_id: string | null;
  meals: CorpMeal[];
}

export interface CorpOrder {
  id: string;
  order_code: string;
  company_id: string;
  delivery_date: string | null;
  status: 'pending' | 'confirmed' | 'delivered' | 'cancelled' | 'refunded';
  total_amount: number;
  employee_cost: number;
  company_cost: number;
  bd_cost: number;
  created_at: string;
  items: CorpOrderItem[];
}

export interface CorpOrderItem {
  id: string;
  meal_name: string;
  tier: string;
  unit_price: number;
  company_subsidy: number;
  bd_subsidy: number;
  line_total: number;
  meal_recipe?: { display_name: string; image_url: string | null; category: string | null };
}

// ── Request helper ────────────────────────────────────────────────────────────

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getCorpToken();

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    clearCorpAuth();
    if (typeof window !== 'undefined') window.location.href = '/corporate/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? 'Request failed');
  }

  const text = await res.text();
  if (!text) return null as T;
  return JSON.parse(text) as T;
}

// ── Auth endpoints (no token required) ───────────────────────────────────────

export const corpAuth = {
  managerLogin: (company_id: string, pin: string) =>
    request<{ access_token: string; user: CorpUser }>(
      '/corp-auth/manager-login',
      { method: 'POST', body: JSON.stringify({ company_id, pin }) },
    ),

  employeePinLogin: (company_id: string, email: string, pin: string) =>
    request<{ access_token: string; user: CorpUser }>(
      '/corp-auth/employee-pin-login',
      { method: 'POST', body: JSON.stringify({ company_id, email, pin }) },
    ),

  requestMagicLink: (email: string, company_id: string) =>
    request<{ ok: boolean; message: string; dev_token?: string; dev_link?: string }>(
      '/corp-auth/magic-link',
      { method: 'POST', body: JSON.stringify({ email, company_id }) },
    ),

  verifyToken: (token: string) =>
    request<{ access_token: string; user: CorpUser }>(
      `/corp-auth/verify?token=${encodeURIComponent(token)}`,
    ),

  getCompany: (company_id: string) =>
    request<{ ok: boolean; company: { id: string; name: string; allowed_email_domain?: string } }>(
      `/corp-auth/company/${encodeURIComponent(company_id)}`,
    ),

  registerEmployee: (data: { company_id: string; name: string; email: string; pin?: string }) =>
    request<{ access_token: string; user: CorpUser }>(
      '/corp-auth/register-employee',
      { method: 'POST', body: JSON.stringify(data) },
    ),
};

// ── Portal endpoints (corp_employee or corp_manager JWT required) ─────────────

export const corpPortal = {
  getMenu: () =>
    request<{ ok: boolean; week: string | null; week_start: string | null; plan_id: string | null; meals: CorpMeal[]; weeks?: WeekMenu[]; pricing?: TierPricingConfig | null; company?: any }>(
      '/corp-portal/menu',
    ),

  placeOrder: (items: Array<{ meal_id: string; tier?: string }>, delivery_date?: string) =>
    request<{ ok: boolean; order_code: string; order: CorpOrder; summary?: any }>(
      '/corp-portal/orders',
      { method: 'POST', body: JSON.stringify({ items, delivery_date }) },
    ),

  getMyOrders: () =>
    request<{ ok: boolean; orders: CorpOrder[] }>('/corp-portal/orders'),

  getProfile: () =>
    request<{ ok: boolean; type: string; employee?: any; company?: any }>('/corp-portal/profile'),

  getWeekOrderCount: (delivery_date?: string) =>
    request<{ ok: boolean; count: number }>(`/corp-portal/week-order-count${delivery_date ? `?delivery_date=${delivery_date}` : ''}`),

  updateMyEmail: (email: string) =>
    request<any>('/corp-portal/profile/email', { method: 'PATCH', body: JSON.stringify({ email }) }),

  swapOrderItem: (orderId: string, itemId: string, newMealId: string) =>
    request<any>(`/corp-portal/orders/${orderId}/items/${itemId}`, {
      method: 'PATCH', body: JSON.stringify({ meal_id: newMealId }),
    }),
};

// ── Manager endpoints (corp_manager JWT required) ─────────────────────────────

export const corpManager = {
  getDashboard: () =>
    request<any>('/corp-manager/dashboard'),

  getCompany: () =>
    request<{ ok: boolean; company: any }>('/corp-manager/account'),

  getEmployees: () =>
    request<{ ok: boolean; employees: any[] }>('/corp-manager/employees'),

  getOrders: (limit = 100) =>
    request<{ ok: boolean; orders: CorpOrder[] }>(`/corp-manager/orders?limit=${limit}`),

  getInvoices: () =>
    request<{ ok: boolean; invoices: any[] }>('/corp-manager/invoices'),

  getInvoiceDetail: (id: string) =>
    request<any>(`/corp-manager/invoices/${id}`),

  getMonthlyReport: (month?: string) =>
    request<any>(`/corp-manager/monthly-report${month ? `?month=${month}` : ''}`),

  getParLevels: () =>
    request<{ ok: boolean; par_levels: any[] }>('/corp-manager/par-levels'),

  getBenefitLevels: () =>
    request<{ ok: boolean; benefit_levels: any[] }>('/corp-manager/benefit-levels'),

  getAccount: () =>
    request<{ ok: boolean; company: any }>('/corp-manager/account'),

  updateAccount: (data: any) =>
    request<{ ok: boolean; company: any }>('/corp-manager/account', {
      method: 'PATCH', body: JSON.stringify(data),
    }),

  bulkEmployeeAction: (action: string, employee_ids: string[], params?: any) =>
    request<any>('/corp-manager/employees/bulk-action', {
      method: 'POST', body: JSON.stringify({ action, employee_ids, params }),
    }),

  setEmployeePin: (employee_id: string, pin: string) =>
    request<{ ok: boolean }>(`/corp-manager/employees/${employee_id}/pin`, {
      method: 'PATCH', body: JSON.stringify({ pin }),
    }),

  updateEmployee: (employee_id: string, data: any) =>
    request<any>(`/corp-manager/employees/${employee_id}`, {
      method: 'PATCH', body: JSON.stringify(data),
    }),

  resendMagicLink: (employee_id: string) =>
    request<any>(`/corp-manager/employees/${employee_id}/resend-link`, { method: 'POST' }),

  deactivateEmployee: (employee_id: string) =>
    request<any>(`/corp-manager/employees/${employee_id}/deactivate`, { method: 'POST' }),

  updateBenefitLevelAllowances: (level_id: string, tier_config: any) =>
    request<any>(`/corp-manager/benefit-levels/${level_id}`, {
      method: 'PATCH', body: JSON.stringify({ tier_config }),
    }),

  saveParLevels: (levels: any[]) =>
    request<any>('/corp-manager/par-levels', {
      method: 'POST', body: JSON.stringify({ levels }),
    }),

  updateCompany: (data: any) =>
    request<any>('/corp-manager/account', {
      method: 'PATCH', body: JSON.stringify(data),
    }),

  updatePin: (pin: string) =>
    request<any>('/corp-manager/pin', {
      method: 'PATCH', body: JSON.stringify({ pin }),
    }),

  sendReminders: () =>
    request<any>('/corp-manager/send-reminders', { method: 'POST' }),
};
