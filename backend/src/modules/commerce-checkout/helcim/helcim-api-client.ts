import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { HelcimApiError } from './helcim-api-error';
import type { HelcimPayInitRequest, HelcimPayInitResponse } from './types/helcim-pay-init.types';
import type { HelcimPurchaseRequest, HelcimPurchaseResponse } from './types/helcim-purchase.types';
import type { HelcimRefundRequest, HelcimRefundResponse } from './types/helcim-refund.types';
import type {
  HelcimCardListResponse,
  HelcimCreateCustomerRequest,
  HelcimCustomerResponse,
} from './types/helcim-customer.types';

/**
 * HelcimApiClient — low-level HTTP wrapper around `api.helcim.com/v2`.
 *
 * Responsibilities:
 *   - Add required headers (`api-token`, `accept`, `content-type`)
 *   - Add `idempotency-key` on Payment API calls
 *   - Parse JSON responses
 *   - Throw HelcimApiError on non-2xx with typed helpers for the caller
 *   - Log every request (path + status + body length) for audit
 *
 * What this class does NOT do:
 *   - Know about our business logic (customers, orders, etc.) — that's HelcimService
 *   - Construct idempotency keys — the caller supplies them
 *   - Retry on failure — the caller's responsibility
 *   - Validate request bodies — TypeScript types are the only validation
 *
 * Research: conner/data-model/helcim-integration.md §2
 * Implementation plan: conner/data-model/helcim-integration-plan.md §4
 */
@Injectable()
export class HelcimApiClient {
  private readonly baseUrl = 'https://api.helcim.com/v2';
  private readonly logger = new Logger(HelcimApiClient.name);

  constructor(private readonly config: ConfigService) {}

  // ─── HelcimPay.js ─────────────────────────────────────────────────────────

  /**
   * POST /helcim-pay/initialize — create a HelcimPay.js checkout session.
   * Returns checkoutToken + secretToken. Not a Payment API call, so no
   * idempotency key required.
   */
  async postHelcimPayInitialize(body: HelcimPayInitRequest): Promise<HelcimPayInitResponse> {
    return this.post<HelcimPayInitRequest, HelcimPayInitResponse>(
      '/helcim-pay/initialize',
      body,
    );
  }

  // ─── Payment API ──────────────────────────────────────────────────────────

  /**
   * POST /payment/purchase — charge a card (raw or token).
   * idempotency-key is REQUIRED on this endpoint. Helcim rejects the
   * request with 400 if missing.
   */
  async postPurchase(
    body: HelcimPurchaseRequest,
    idempotencyKey: string,
  ): Promise<HelcimPurchaseResponse> {
    return this.post<HelcimPurchaseRequest, HelcimPurchaseResponse>(
      '/payment/purchase',
      body,
      { idempotencyKey },
    );
  }

  /**
   * POST /payment/refund — full or partial refund of a prior transaction.
   * idempotency-key is REQUIRED.
   */
  async postRefund(
    body: HelcimRefundRequest,
    idempotencyKey: string,
  ): Promise<HelcimRefundResponse> {
    return this.post<HelcimRefundRequest, HelcimRefundResponse>(
      '/payment/refund',
      body,
      { idempotencyKey },
    );
  }

  // ─── Customer API ─────────────────────────────────────────────────────────

  /** POST /customers — create a new Helcim customer, returns customerCode. */
  async createCustomer(body: HelcimCreateCustomerRequest): Promise<HelcimCustomerResponse> {
    return this.post<HelcimCreateCustomerRequest, HelcimCustomerResponse>('/customers', body);
  }

  /** GET /customers/{customerCode} — fetch one customer. */
  async getCustomer(customerCode: string): Promise<HelcimCustomerResponse> {
    return this.get<HelcimCustomerResponse>(`/customers/${encodeURIComponent(customerCode)}`);
  }

  /** GET /customers/{customerCode}/cards — list saved cards. */
  async listCustomerCards(customerCode: string): Promise<HelcimCardListResponse> {
    return this.get<HelcimCardListResponse>(
      `/customers/${encodeURIComponent(customerCode)}/cards`,
    );
  }

  /** DELETE /customers/{customerCode}/cards/{cardId} — remove a saved card. */
  async deleteCustomerCard(customerCode: string, cardId: number | string): Promise<void> {
    await this.delete(
      `/customers/${encodeURIComponent(customerCode)}/cards/${encodeURIComponent(String(cardId))}`,
    );
  }

  /** PUT /customers/{customerCode}/cards/{cardId}/default — mark card as default. */
  async setDefaultCard(customerCode: string, cardId: number | string): Promise<void> {
    await this.put(
      `/customers/${encodeURIComponent(customerCode)}/cards/${encodeURIComponent(String(cardId))}/default`,
      {},
    );
  }

  // ─── Private HTTP helpers ─────────────────────────────────────────────────

  private async post<TReq, TRes>(
    path: string,
    body: TReq,
    opts: { idempotencyKey?: string } = {},
  ): Promise<TRes> {
    const headers = this.buildHeaders();
    if (opts.idempotencyKey) {
      headers['idempotency-key'] = opts.idempotencyKey;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    return this.parseResponse<TRes>(res, path);
  }

  private async get<TRes>(path: string): Promise<TRes> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: this.buildHeaders(),
    });
    return this.parseResponse<TRes>(res, path);
  }

  private async put<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });
    return this.parseResponse<TRes>(res, path);
  }

  private async delete(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: this.buildHeaders(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw HelcimApiError.fromResponseBody(res.status, text, path);
    }
  }

  private buildHeaders(): Record<string, string> {
    const token = this.config.get<string>('HELCIM_API_TOKEN');
    if (!token) {
      throw new Error(
        'HELCIM_API_TOKEN is not set. See backend/.env.example and helcim-integration.md §3.',
      );
    }
    return {
      'api-token': token,
      accept: 'application/json',
      'content-type': 'application/json',
    };
  }

  private async parseResponse<T>(res: Response, path: string): Promise<T> {
    const text = await res.text();
    this.logger.debug(
      `Helcim ${res.status} ${path} (${text.length} bytes)${res.ok ? '' : ' FAILED'}`,
    );
    if (!res.ok) {
      throw HelcimApiError.fromResponseBody(res.status, text, path);
    }
    // Helcim returns empty bodies on some successful calls (e.g. DELETE, PUT default)
    if (!text) return undefined as unknown as T;
    try {
      return JSON.parse(text) as T;
    } catch (err) {
      this.logger.error(`Helcim returned non-JSON success body on ${path}: ${text.slice(0, 200)}`);
      throw new HelcimApiError(res.status, path, text, null);
    }
  }
}
