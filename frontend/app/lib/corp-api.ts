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

  requestMagicLink: (email: string, company_id: string) =>
    request<{ ok: boolean; message: string }>(
      '/corp-auth/magic-link',
      { method: 'POST', body: JSON.stringify({ email, company_id }) },
    ),

  verifyToken: (token: string) =>
    request<{ access_token: string; user: CorpUser }>(
      `/corp-auth/verify?token=${encodeURIComponent(token)}`,
    ),
};

// ── Portal endpoints (corp_employee or corp_manager JWT required) ─────────────

export const corpPortal = {
  getMenu: () =>
    request<{ ok: boolean; week: string | null; week_start: string | null; plan_id: string | null; meals: CorpMeal[] }>(
      '/corp-portal/menu',
    ),

  placeOrder: (items: Array<{ meal_id: string; tier: string }>, delivery_date?: string) =>
    request<{ ok: boolean; order_code: string; order: CorpOrder }>(
      '/corp-portal/orders',
      { method: 'POST', body: JSON.stringify({ items, delivery_date }) },
    ),

  getMyOrders: () =>
    request<{ ok: boolean; orders: CorpOrder[] }>('/corp-portal/orders'),

  getProfile: () =>
    request<{ ok: boolean; type: string; employee?: any; company?: any }>('/corp-portal/profile'),
};

// ── Manager endpoints (corp_manager JWT required) ─────────────────────────────

export const corpManager = {
  getDashboard: () =>
    request<any>('/corp-manager/dashboard'),

  getEmployees: () =>
    request<{ ok: boolean; employees: any[] }>('/corp-manager/employees'),

  getOrders: (limit = 100) =>
    request<{ ok: boolean; orders: CorpOrder[] }>(`/corp-manager/orders?limit=${limit}`),

  getInvoices: () =>
    request<{ ok: boolean; invoices: any[] }>('/corp-manager/invoices'),
};
