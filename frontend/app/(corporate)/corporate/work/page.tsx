'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getCorpUser, clearCorpAuth,
  corpPortal,
  type CorpMeal, type CorpOrder, type TierPricingConfig,
} from '../../../lib/corp-api';

const dark    = '#00465e';
const primary = '#4ea2fd';
const green   = '#27ae60';
const red     = '#e74c3c';
const cream   = '#faebda';

type CartItem = { meal: CorpMeal; tier: string; price: number };
type Tab = 'menu' | 'orders';

// ── Tier helpers ──────────────────────────────────────────────────────────────

function bestAvailableTier(pricing: TierPricingConfig, orderedToday: number) {
  const { free, tier1, tier2, tier3 } = pricing;
  if (orderedToday < free.meals) return { tier: 'free', price: free.employeePrice };
  const t1used = Math.max(0, orderedToday - free.meals);
  if (t1used < tier1.meals) return { tier: 'tier1', price: tier1.employeePrice };
  const t2used = Math.max(0, t1used - tier1.meals);
  if (t2used < tier2.meals) return { tier: 'tier2', price: tier2.employeePrice };
  return { tier: 'tier3', price: tier3.employeePrice > 0 ? tier3.employeePrice : pricing.free.companySubsidy + pricing.free.bdSubsidy };
}

function tierLabel(tier: string) {
  return { free: 'FREE', tier1: 'Tier 1', tier2: 'Tier 2', tier3: 'Tier 3' }[tier] ?? tier;
}

function tierColor(tier: string) {
  return { free: green, tier1: primary, tier2: '#9b59b6', tier3: '#e67e22' }[tier] ?? '#666';
}

// ── Meal card ─────────────────────────────────────────────────────────────────

function MealCard({ meal, cartItem, onAdd, onRemove }: {
  meal: CorpMeal;
  cartItem?: CartItem;
  onAdd: (tier: string, price: number) => void;
  onRemove: () => void;
}) {
  const { tier, price } = bestAvailableTier(meal.pricing, 0);
  const inCart = !!cartItem;

  return (
    <div style={{
      background: '#fff', borderRadius: '20px', overflow: 'hidden',
      boxShadow: inCart ? `0 0 0 3px ${primary}, 0 8px 24px rgba(0,70,94,.14)` : '0 3px 12px rgba(0,70,94,.08)',
      display: 'flex', flexDirection: 'column', transition: 'box-shadow .2s',
    }}>
      {/* Image */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '1/1', background: '#f0f0f0', overflow: 'hidden' }}>
        {meal.image_url ? (
          <img src={meal.image_url} alt={meal.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', background: 'linear-gradient(135deg,#e8d5c4,#d4c4b0)' }}>🍽️</div>
        )}
        {/* Tier badge */}
        <div style={{
          position: 'absolute', top: '10px', right: '10px',
          background: tierColor(tier), color: '#fff',
          fontSize: '.62rem', fontWeight: 900, padding: '3px 8px',
          borderRadius: '999px', letterSpacing: '.5px', textTransform: 'uppercase',
        }}>{tierLabel(tier)}</div>
        {/* Diet badge */}
        {meal.dietary_tags?.includes('Vegan') && (
          <div style={{
            position: 'absolute', top: '10px', left: '10px',
            background: 'rgba(39,174,96,.9)', color: '#fff',
            fontSize: '.62rem', fontWeight: 900, padding: '3px 8px',
            borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '.5px',
          }}>Vegan</div>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '14px 14px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: '7px' }}>
        <div style={{ fontSize: '.95rem', fontWeight: 800, color: dark, lineHeight: 1.3 }}>{meal.display_name}</div>
        {meal.short_description && (
          <div style={{ fontSize: '.78rem', color: '#6b7f90', lineHeight: 1.5, overflow: 'hidden', WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical' as any }}>
            {meal.short_description}
          </div>
        )}
        {/* Macros */}
        {(meal.calories || meal.protein_g) && (
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            {meal.calories && <span style={{ fontSize: '.65rem', fontWeight: 700, padding: '3px 7px', borderRadius: '6px', background: 'rgba(0,70,94,.07)', color: '#50657a', textTransform: 'uppercase', letterSpacing: '.3px' }}>{meal.calories} cal</span>}
            {meal.protein_g && <span style={{ fontSize: '.65rem', fontWeight: 700, padding: '3px 7px', borderRadius: '6px', background: 'rgba(78,162,253,.1)', color: primary, textTransform: 'uppercase', letterSpacing: '.3px' }}>{meal.protein_g}g protein</span>}
          </div>
        )}

        {/* Add / Qty control */}
        <div style={{ marginTop: 'auto', paddingTop: '10px' }}>
          {inCart ? (
            <div style={{ display: 'flex', alignItems: 'center', background: primary, borderRadius: '14px', overflow: 'hidden' }}>
              <button onClick={onRemove} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer', padding: '12px 18px', fontWeight: 700 }}>−</button>
              <span style={{ flex: 1, textAlign: 'center', color: '#fff', fontWeight: 800, fontSize: '.9rem' }}>1 added</span>
              <button onClick={onRemove} style={{ background: 'rgba(0,0,0,.12)', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer', padding: '12px 18px', fontWeight: 700 }}>−</button>
            </div>
          ) : (
            <button
              onClick={() => onAdd(tier, price)}
              style={{
                width: '100%', background: dark, color: '#fff', border: 'none',
                borderRadius: '14px', padding: '13px 0', fontSize: '.9rem',
                fontWeight: 800, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {price === 0 ? 'Add — FREE' : `Add — $${price.toFixed(2)}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CorporateWorkPage() {
  const router = useRouter();
  const [user, setUser] = useState<ReturnType<typeof getCorpUser>>(null);
  const [tab, setTab] = useState<Tab>('menu');
  const [menu, setMenu] = useState<{ week: string | null; meals: CorpMeal[] } | null>(null);
  const [orders, setOrders] = useState<CorpOrder[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordering, setOrdering] = useState(false);
  const [toast, setToast] = useState('');
  const [filter, setFilter] = useState('All');

  useEffect(() => {
    const u = getCorpUser();
    if (!u) { router.replace('/corporate/login'); return; }
    setUser(u);
    loadMenu();
  }, [router]);

  async function loadMenu() {
    setLoading(true);
    try {
      const res = await corpPortal.getMenu();
      setMenu({ week: res.week, meals: res.meals ?? [] });
    } catch (e: any) {
      showToast(e.message ?? 'Failed to load menu');
    } finally {
      setLoading(false);
    }
  }

  async function loadOrders() {
    try {
      const res = await corpPortal.getMyOrders();
      setOrders(res.orders ?? []);
    } catch {}
  }

  useEffect(() => {
    if (tab === 'orders') loadOrders();
  }, [tab]);

  function addToCart(meal: CorpMeal, tier: string, price: number) {
    if (cart.find(c => c.meal.id === meal.id)) return;
    setCart(prev => [...prev, { meal, tier, price }]);
    showToast(`${meal.display_name} added`);
  }

  function removeFromCart(mealId: string) {
    setCart(prev => prev.filter(c => c.meal.id !== mealId));
  }

  async function placeOrder() {
    if (!cart.length) return;
    setOrdering(true);
    try {
      const items = cart.map(c => ({ meal_id: c.meal.id, tier: c.tier }));
      const res = await corpPortal.placeOrder(items);
      setCart([]);
      showToast(`Order #${res.order_code} placed! ✓`);
      setTab('orders');
      loadOrders();
    } catch (e: any) {
      showToast(e.message ?? 'Failed to place order');
    } finally {
      setOrdering(false);
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  function logout() {
    clearCorpAuth();
    router.replace('/corporate/login');
  }

  const categories = menu ? ['All', ...Array.from(new Set(menu.meals.map(m => m.category ?? 'Other'))).filter(Boolean)] : ['All'];
  const filtered = menu?.meals.filter(m => filter === 'All' || m.category === filter) ?? [];
  const totalCost = cart.reduce((s, c) => s + c.price, 0);
  const initials = user?.name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) ?? '?';

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: cream, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: `3px solid #e8edf2`, borderTopColor: primary, animation: 'spin .7s linear infinite', margin: '0 auto 12px' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ color: '#7b8c9f', fontSize: '.88rem' }}>Loading your menu…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: cream, fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ background: dark, position: 'sticky', top: 0, zIndex: 300 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px' }}>
          <div>
            <div style={{ color: '#fff', fontWeight: 900, fontSize: '1.05rem' }}>BetterDay for Work</div>
            {menu?.week && <div style={{ color: 'rgba(255,255,255,.55)', fontSize: '.72rem' }}>Week of {menu.week}</div>}
          </div>
          <button
            onClick={logout}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.15)', borderRadius: '999px', padding: '6px 12px 6px 8px', cursor: 'pointer' }}
          >
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.72rem', fontWeight: 900, color: '#fff' }}>{initials}</div>
            <span style={{ fontSize: '.78rem', color: 'rgba(255,255,255,.8)', fontWeight: 700 }}>{user?.name?.split(' ')[0] ?? 'Me'}</span>
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderTop: '1px solid rgba(255,255,255,.08)' }}>
          {(['menu', 'orders'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '11px', fontSize: '.85rem', fontWeight: 800,
              color: tab === t ? '#fff' : 'rgba(255,255,255,.45)',
              border: 'none', background: 'transparent', fontFamily: "'DM Sans', sans-serif",
              borderBottom: `3px solid ${tab === t ? primary : 'transparent'}`,
              cursor: 'pointer', textTransform: 'capitalize', transition: '.15s',
            }}>{t === 'menu' ? `📋 This Week` : `📦 My Orders${orders.length ? ` (${orders.length})` : ''}`}</button>
          ))}
        </div>
      </div>

      {/* ── Menu tab ── */}
      {tab === 'menu' && (
        <div style={{ padding: '20px' }}>
          {/* Category filter */}
          {categories.length > 2 && (
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', marginBottom: '16px', paddingBottom: '4px' }}>
              {categories.map(c => (
                <button key={c} onClick={() => setFilter(c)} style={{
                  padding: '7px 16px', borderRadius: '999px', border: 'none',
                  background: filter === c ? dark : 'rgba(0,70,94,.08)',
                  color: filter === c ? '#fff' : dark,
                  fontWeight: 800, fontSize: '.78rem', cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
                }}>{c}</button>
              ))}
            </div>
          )}

          {/* No menu state */}
          {!filtered.length && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🍽️</div>
              <p style={{ color: dark, fontWeight: 800, fontSize: '1.1rem', marginBottom: '6px' }}>No menu this week yet</p>
              <p style={{ color: '#7b8c9f', fontSize: '.85rem' }}>Check back soon — your meal plan will appear here once published.</p>
            </div>
          )}

          {/* Meal grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', marginBottom: cart.length ? '100px' : '24px' }}>
            {filtered.map(meal => (
              <MealCard
                key={meal.id}
                meal={meal}
                cartItem={cart.find(c => c.meal.id === meal.id)}
                onAdd={(tier, price) => addToCart(meal, tier, price)}
                onRemove={() => removeFromCart(meal.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Orders tab ── */}
      {tab === 'orders' && (
        <div style={{ padding: '20px' }}>
          {!orders.length ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📦</div>
              <p style={{ color: dark, fontWeight: 800, fontSize: '1.1rem', marginBottom: '6px' }}>No orders yet</p>
              <p style={{ color: '#7b8c9f', fontSize: '.85rem' }}>Your orders will appear here after you order from the menu.</p>
            </div>
          ) : orders.map(order => (
            <div key={order.id} style={{ background: '#fff', borderRadius: '16px', padding: '18px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,70,94,.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div>
                  <div style={{ fontWeight: 900, color: dark, fontSize: '.95rem' }}>Order #{order.order_code}</div>
                  <div style={{ fontSize: '.72rem', color: '#7b8c9f' }}>{new Date(order.created_at).toLocaleDateString()}</div>
                </div>
                <div style={{
                  padding: '4px 10px', borderRadius: '999px', fontSize: '.72rem', fontWeight: 800,
                  background: order.status === 'delivered' ? 'rgba(39,174,96,.1)' : 'rgba(78,162,253,.1)',
                  color: order.status === 'delivered' ? green : primary,
                  textTransform: 'capitalize',
                }}>{order.status}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {order.items.map(item => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '.85rem', color: dark, fontWeight: 600 }}>{item.meal_name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '.7rem', fontWeight: 700, color: tierColor(item.tier), background: `${tierColor(item.tier)}18`, padding: '2px 7px', borderRadius: '999px' }}>{tierLabel(item.tier)}</span>
                      <span style={{ fontSize: '.82rem', fontWeight: 700, color: dark }}>{item.unit_price === 0 ? 'FREE' : `$${item.unit_price.toFixed(2)}`}</span>
                    </div>
                  </div>
                ))}
              </div>
              {order.employee_cost > 0 && (
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', fontSize: '.82rem', fontWeight: 800, color: dark }}>
                  <span>Your total</span><span>${order.employee_cost.toFixed(2)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Floating cart bar */}
      {cart.length > 0 && tab === 'menu' && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 400,
          background: dark, padding: '16px 20px 24px',
          boxShadow: '0 -8px 32px rgba(0,0,0,.2)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: '.9rem' }}>{cart.length} meal{cart.length > 1 ? 's' : ''} in cart</span>
            <span style={{ color: totalCost === 0 ? '#ffd54f' : '#fff', fontWeight: 900, fontSize: '.9rem' }}>
              {totalCost === 0 ? 'FREE ✓' : `$${totalCost.toFixed(2)}`}
            </span>
          </div>
          <button
            onClick={placeOrder}
            disabled={ordering}
            style={{
              width: '100%', padding: '15px', background: ordering ? '#93adb8' : primary,
              color: '#fff', border: 'none', borderRadius: '14px',
              fontFamily: "'DM Sans', sans-serif", fontSize: '1rem', fontWeight: 800, cursor: 'pointer',
            }}
          >{ordering ? 'Placing order…' : 'Place Order →'}</button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: cart.length && tab === 'menu' ? '110px' : '24px',
          left: '50%', transform: 'translateX(-50%)',
          background: dark, color: '#fff', padding: '13px 22px', borderRadius: '14px',
          fontSize: '.88rem', fontWeight: 700, boxShadow: '0 8px 28px rgba(0,0,0,.25)',
          zIndex: 500, whiteSpace: 'nowrap',
        }}>{toast}</div>
      )}
    </div>
  );
}
