'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  getCorpUser, clearCorpAuth,
  corpPortal,
  type CorpMeal, type CorpOrder, type TierPricingConfig, type WeekMenu,
} from '../../../lib/corp-api';

// ── Types ─────────────────────────────────────────────────────────────────────

type CartItem = { meal: CorpMeal; tier: string; price: number };
type Screen   = 'menu' | 'orders' | 'profile' | 'thankyou';

interface SwapTarget { order: CorpOrder; itemId: string; mealName: string; }

interface ThankYouData {
  order_code: string;
  employee_name: string | null;
  employee_cost: number;
  company_cost: number;
  delivery_day: string | null;
  fridge_location: string | null;
  meal_names: string[];
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function getTierForPosition(pos: number, p: TierPricingConfig): { tier: string; price: number } {
  if (pos < p.free.meals) return { tier: 'free', price: p.free.employeePrice };
  const a1 = pos - p.free.meals;
  if (p.tier1.meals > 0 && a1 < p.tier1.meals) return { tier: 'tier1', price: p.tier1.employeePrice };
  const a2 = a1 - p.tier1.meals;
  if (p.tier2.meals > 0 && a2 < p.tier2.meals) return { tier: 'tier2', price: p.tier2.employeePrice };
  const a3 = a2 - p.tier2.meals;
  if (p.tier3.meals > 0 && a3 < p.tier3.meals) return { tier: 'tier3', price: p.tier3.employeePrice };
  if (p.allow_extra) return { tier: 'full', price: p.full_price };
  return { tier: 'capped', price: 0 };
}

function tierLabel(t: string) {
  return ({ free: 'FREE', tier1: 'TIER 1', tier2: 'TIER 2', tier3: 'TIER 3', full: 'FULL PRICE', capped: '—' } as any)[t] ?? t.toUpperCase();
}

function tierColor(t: string) {
  return ({ free: '#27ae60', tier1: '#4ea2fd', tier2: '#9b59b6', tier3: '#e67e22', full: '#e74c3c', capped: '#bbb' } as any)[t] ?? '#888';
}

function fmtPrice(n: number) {
  return n === 0 ? 'FREE' : `$${n.toFixed(2)}`;
}

function getDietType(meal: CorpMeal): 'plant' | 'meat' | null {
  const pt = (meal.protein_types ?? []).map((s: string) => s.toLowerCase());
  const dt = (meal.dietary_tags ?? []).map((s: string) => s.toLowerCase());
  if (dt.includes('vegan') || dt.includes('vegetarian') || pt.includes('plant') || pt.includes('vegan') || pt.includes('vegetarian')) return 'plant';
  if (pt.some((p: string) => ['chicken','beef','pork','fish','shrimp','seafood','turkey','lamb','meat'].includes(p))) return 'meat';
  return null;
}

function nextDeliveryDate(day: string | null | undefined): string | null {
  if (!day) return null;
  const idx = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].indexOf(day);
  if (idx === -1) return null;
  const now = new Date();
  let diff = idx - now.getDay();
  if (diff <= 0) diff += 7;
  const d = new Date(now); d.setDate(now.getDate() + diff);
  return d.toISOString().split('T')[0];
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  return new Date(s + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'long', month: 'short', day: 'numeric' });
}

// ── CSS (matches work.html exactly) ─────────────────────────────────────────

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap');
:root { --cream:#faebda; --dark:#00465e; --primary:#4ea2fd; --green:#27ae60; --red:#e74c3c; --amber:#f39c12; --yellow:#ffd54f; --radius:20px; }

.work-shell { font-family:'DM Sans',sans-serif; background:var(--cream); color:var(--dark); display:flex; flex-direction:column; height:100dvh; overflow:hidden; }

/* Topbar */
.w-topbar { background:var(--dark); padding:0 20px; display:flex; align-items:center; justify-content:space-between; height:58px; flex-shrink:0; gap:8px; }
.w-brand { display:flex; align-items:center; gap:0; }
.w-brand-name { font-size:1.15rem; font-weight:900; color:#fff; font-family:'DM Sans',sans-serif; }
.w-brand-name span { color:var(--primary); }
.w-for-work { display:none; }
.w-topbar-right { display:flex; align-items:center; gap:8px; margin-left:auto; }
.w-next-chip { font-size:.78rem; color:rgba(255,255,255,.7); background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.15); border-radius:999px; padding:4px 12px; white-space:nowrap; }
.w-next-chip strong { color:#7dd8ff; }
.w-user-chip { display:flex; align-items:center; gap:8px; background:rgba(255,255,255,.1); border-radius:999px; padding:6px 14px 6px 8px; border:1px solid rgba(255,255,255,.15); cursor:pointer; }
.w-user-chip:hover { background:rgba(255,255,255,.15); }
.w-avatar { width:28px; height:28px; border-radius:50%; background:var(--primary); display:flex; align-items:center; justify-content:center; font-size:.72rem; font-weight:900; color:#fff; flex-shrink:0; }
.w-uname { font-size:.82rem; font-weight:700; color:#fff; }
@media(max-width:600px){.w-uname{display:none;} .w-user-chip{padding:4px;border-radius:50%;} .w-next-chip{font-size:.74rem;padding:4px 10px;} .w-for-work{display:none;}}

/* Week tabs row */
.w-tabs-row { background:var(--dark); border-top:1px solid rgba(255,255,255,.08); display:flex; align-items:stretch; flex-shrink:0; box-shadow:0 4px 16px rgba(0,0,0,.2); z-index:10; }
.w-tabs-bar { display:flex; align-items:stretch; overflow-x:auto; flex:1; }
.w-tab { padding:11px 18px; font-size:.88rem; font-weight:800; color:rgba(255,255,255,.5); cursor:pointer; border:none; background:transparent; font-family:'DM Sans',sans-serif; border-bottom:3px solid transparent; white-space:nowrap; transition:.15s; }
.w-tab:hover { color:rgba(255,255,255,.8); }
.w-tab.active { color:#fff; border-bottom-color:var(--primary); }
.w-tab-date { display:block; font-size:.68rem; font-weight:500; color:rgba(255,255,255,.4); margin-top:2px; }
.w-tab.active .w-tab-date { color:rgba(255,255,255,.6); }
.w-inline-pricing { display:flex; align-items:center; padding:0 20px; flex-shrink:0; gap:0; border-left:1px solid rgba(255,255,255,.1); }
.w-pricing-company { font-size:.8rem; font-weight:900; color:#fff; white-space:nowrap; }
.w-pricing-label { font-size:.58rem; font-weight:600; color:rgba(255,255,255,.4); white-space:nowrap; }
.w-vsep { display:inline-block; width:1px; height:13px; background:rgba(255,255,255,.2); vertical-align:middle; margin:0 10px; }
.w-tier-price { font-size:.88rem; font-weight:900; color:#fff; }
@media(max-width:700px){.w-inline-pricing{display:none;}}

/* Menu body */
.w-body { flex:1; display:flex; min-height:0; }
.w-scroll { flex:1; min-width:0; overflow-y:auto; padding:20px 20px 100px; }
@media(min-width:900px){ .w-scroll{padding-bottom:30px;} }
.w-inner { max-width:1100px; margin:0 auto; }

/* Category pills */
.w-cat-wrap { display:flex; margin-bottom:18px; }
.w-cat-inner { display:flex; background:rgba(0,70,94,.88); border-radius:999px; padding:3px; gap:2px; box-shadow:0 2px 10px rgba(0,0,0,.15); }
.w-cat-btn { padding:7px 20px; border-radius:999px; border:none; font-family:'DM Sans',sans-serif; font-size:.78rem; font-weight:800; cursor:pointer; transition:.15s; color:rgba(255,255,255,.55); background:transparent; }
.w-cat-btn:hover { color:rgba(255,255,255,.8); }
.w-cat-btn.active { background:var(--primary); color:#fff; box-shadow:0 2px 8px rgba(78,162,253,.45); }
@media(max-width:600px){ .w-cat-btn{padding:5px 14px;font-size:.72rem;} }

/* Plan summary */
.w-plan-bar { background:rgba(0,70,94,.06); border-radius:14px; padding:10px 14px; margin-bottom:16px; display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
.w-plan-lbl { font-size:.78rem; font-weight:800; color:var(--dark); }
.w-plan-pill { font-size:.72rem; font-weight:700; padding:4px 10px; border-radius:999px; }

/* Meal grid */
.w-meal-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
@media(max-width:900px){ .w-meal-grid{grid-template-columns:repeat(2,1fr);} }
@media(max-width:480px){ .w-meal-grid{grid-template-columns:repeat(2,1fr); gap:10px;} }

/* Meal card */
.meal-card { background:#fff; border-radius:20px; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 3px 12px rgba(0,70,94,.08); transition:transform .2s, box-shadow .2s; }
.meal-card:hover { transform:translateY(-4px); box-shadow:0 12px 32px rgba(0,70,94,.14); }
.meal-card.in-cart { box-shadow:0 0 0 3px var(--primary), 0 8px 24px rgba(0,70,94,.14); }
.meal-img-wrap { position:relative; width:100%; aspect-ratio:1/1; overflow:hidden; flex-shrink:0; background:#f0f0f0; }
.meal-img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .3s; }
.meal-card:hover .meal-img { transform:scale(1.04); }
.meal-body { padding:14px 14px 12px; flex:1; display:flex; flex-direction:column; gap:7px; }
.meal-name { font-size:.95rem; font-weight:800; color:var(--dark); line-height:1.3; }
.meal-desc { font-size:.78rem; color:#6b7f90; line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.meal-footer { margin-top:auto; padding-top:10px; }
.diet-badge { position:absolute; top:10px; left:10px; font-size:.62rem; font-weight:900; text-transform:uppercase; letter-spacing:.5px; padding:3px 8px; border-radius:999px; backdrop-filter:blur(6px); }
.diet-badge-meat { background:rgba(0,70,94,.75); color:#fff; }
.diet-badge-plant { background:rgba(39,174,96,.85); color:#fff; }
.tier-badge { position:absolute; top:10px; right:10px; font-size:.62rem; font-weight:900; text-transform:uppercase; letter-spacing:.5px; padding:3px 9px; border-radius:999px; color:#fff; }
.macros-row { display:flex; gap:5px; flex-wrap:wrap; }
.macro-chip { font-size:.65rem; font-weight:700; text-transform:uppercase; letter-spacing:.3px; padding:3px 7px; border-radius:6px; }
.macro-chip.cal  { background:#fff3e8; color:#b56b10; }
.macro-chip.pro  { background:#eaf7ef; color:#1a7a46; }
.macro-chip.carb { background:#e8f3ff; color:#1a5ca0; }
.macro-chip.fat  { background:#f6f0ff; color:#6b3fa0; }
.btn-add { background:var(--dark); color:#fff; border:none; border-radius:14px; padding:13px 0; font-size:.9rem; font-weight:800; cursor:pointer; font-family:'DM Sans',sans-serif; transition:.15s; box-shadow:0 4px 14px rgba(0,70,94,.22); width:100%; letter-spacing:.2px; }
.btn-add:hover { background:#005a7a; transform:translateY(-1px); box-shadow:0 6px 18px rgba(0,70,94,.28); }
.qty-pill { display:flex; align-items:center; background:var(--primary); color:#fff; border-radius:14px; border:none; width:100%; justify-content:space-between; overflow:hidden; box-shadow:0 4px 14px rgba(78,162,253,.3); }
.qty-btn { background:transparent; border:none; color:#fff; font-size:1.2rem; cursor:pointer; padding:12px 18px; line-height:1; font-weight:700; transition:background .15s; }
.qty-btn:hover { background:rgba(255,255,255,.15); }
.qty-val { font-size:.9rem; font-weight:800; min-width:20px; text-align:center; }
.btn-capped { background:#f0f0f0; color:#bbb; border:none; border-radius:14px; padding:13px 0; font-size:.85rem; font-weight:700; width:100%; cursor:default; }

/* Desktop side cart */
.side-cart { width:290px; flex-shrink:0; background:#fff; border-left:1px solid rgba(0,70,94,.1); display:none; flex-direction:column; overflow:hidden; }
@media(min-width:900px){ .side-cart{display:flex;} }
.sc-head { padding:18px 18px 12px; border-bottom:1px solid #f0f4f8; flex-shrink:0; }
.sc-title { font-size:1.05rem; font-weight:900; color:var(--dark); }
.sc-delivery { font-size:.7rem; color:#9aabb8; margin-top:3px; }
.sc-empty { padding:32px 18px; text-align:center; color:#9eb0bc; font-size:.85rem; }
.sc-items { flex:1; overflow-y:auto; padding:6px 14px; }
.sc-item-row { display:flex; align-items:center; gap:9px; padding:8px 0; border-bottom:1px solid #f5f8fa; }
.sc-item-row:last-child { border-bottom:none; }
.sc-thumb { width:36px; height:36px; border-radius:8px; overflow:hidden; flex-shrink:0; background:#e8d5c4; }
.sc-thumb img { width:100%; height:100%; object-fit:cover; }
.sc-item-info { flex:1; min-width:0; }
.sc-item-name { font-size:.75rem; font-weight:700; color:var(--dark); line-height:1.3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sc-item-meta { font-size:.67rem; color:#9aabb8; }
.sc-item-price { font-size:.78rem; font-weight:800; color:var(--dark); flex-shrink:0; }
.sc-remove { background:none; border:none; cursor:pointer; color:#c0cdd6; font-size:1rem; padding:2px 4px; flex-shrink:0; }
.sc-remove:hover { color:var(--red); }
.sc-footer { flex-shrink:0; padding:12px 14px 16px; border-top:1px solid #f0f4f8; }
.sc-subtotal-row { display:flex; justify-content:space-between; font-size:.73rem; padding:2px 0; color:#6b7f90; }
.sc-savings-row { color:var(--green); font-weight:700; }
.sc-total-row { display:flex; justify-content:space-between; align-items:baseline; margin:8px 0 10px; }
.sc-total-row > span:first-child { font-size:.82rem; font-weight:700; color:var(--dark); }
.sc-total-amt { font-size:1.2rem; font-weight:900; color:var(--dark); }
.sc-checkout-btn { width:100%; padding:12px; background:var(--dark); color:#fff; border:none; border-radius:12px; font-size:.88rem; font-weight:800; cursor:pointer; font-family:'DM Sans',sans-serif; transition:.15s; }
.sc-checkout-btn:hover { background:#005a7a; }
.sc-checkout-btn:disabled { background:#93adb8; cursor:not-allowed; }
.sc-clear-btn { width:100%; padding:7px; background:transparent; color:#b0c4cc; border:none; font-size:.72rem; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; margin-top:6px; }
.sc-clear-btn:hover { color:var(--red); }

/* Mobile cart bar */
.mob-cart-bar { position:fixed; bottom:0; left:0; right:0; z-index:300; }
@media(min-width:900px){ .mob-cart-bar{display:none;} }
.mob-cart-toggle { background:var(--dark); padding:12px 14px; display:flex; align-items:center; justify-content:space-between; box-shadow:0 -4px 20px rgba(0,0,0,.25); border-radius:20px 20px 0 0; position:relative; gap:8px; }
.mob-cart-toggle::before { content:''; position:absolute; top:7px; left:50%; transform:translateX(-50%); width:38px; height:4px; background:rgba(255,255,255,.38); border-radius:2px; }
.mob-toggle-left { display:flex; align-items:center; gap:6px; cursor:pointer; flex-shrink:0; }
.mob-cart-badge { background:var(--primary); color:#fff; font-size:.65rem; font-weight:900; border-radius:999px; padding:2px 7px; min-width:20px; text-align:center; }
.mob-toggle-label { font-size:.82rem; font-weight:800; color:#fff; line-height:1; }
.mob-cart-total-label { font-size:1.05rem; font-weight:900; color:#fff; flex:1; text-align:center; }
.mob-review-btn { background:var(--primary); color:#fff; border:none; border-radius:12px; padding:10px 16px; font-size:.78rem; font-weight:800; cursor:pointer; font-family:'DM Sans',sans-serif; white-space:nowrap; flex-shrink:0; }
.mob-cart-sheet { background:#fff; border-radius:20px 20px 0 0; box-shadow:0 -8px 40px rgba(0,0,0,.22); max-height:72vh; overflow-y:auto; }
.mcs-drag-handle { width:36px; height:4px; background:rgba(0,70,94,.15); border-radius:2px; margin:10px auto 2px; }
.mcs-head { padding:6px 20px 10px; border-bottom:1px solid rgba(0,70,94,.07); }
.mcs-title { font-size:1.15rem; font-weight:900; color:var(--dark); }
.mcs-delivery { font-size:.7rem; color:#9aabb8; margin-top:2px; }
.mcs-items { padding:8px 16px; }
.mcs-item-row { display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid rgba(0,70,94,.06); }
.mcs-item-row:last-child { border-bottom:none; }
.mcs-thumb { width:40px; height:40px; border-radius:9px; overflow:hidden; flex-shrink:0; background:#e8d5c4; }
.mcs-thumb img { width:100%; height:100%; object-fit:cover; }
.mcs-item-info { flex:1; min-width:0; }
.mcs-name { font-size:.82rem; font-weight:700; color:var(--dark); line-height:1.3; }
.mcs-item-meta { font-size:.7rem; color:#9aabb8; }
.mcs-price { font-size:.82rem; font-weight:800; color:var(--dark); }
.mcs-rm { background:none; border:none; cursor:pointer; color:#c0cdd6; font-size:1rem; padding:2px; }
.mcs-subtotals { padding:6px 16px 4px; border-top:1px solid rgba(0,70,94,.07); }
.mcs-subtotal-row { display:flex; justify-content:space-between; font-size:.76rem; padding:2px 0; color:#6b7f90; }
.mcs-savings-row { color:var(--green); font-weight:700; }
.mcs-total-row { display:flex; justify-content:space-between; align-items:baseline; padding:10px 16px 2px; }
.mcs-total-row span:first-child { font-size:.88rem; font-weight:700; color:var(--dark); }
.mcs-total-row span:last-child { font-size:1.3rem; font-weight:900; color:var(--dark); }
.mcs-checkout-btn { margin:10px 16px 16px; display:block; width:calc(100% - 32px); padding:14px; background:var(--dark); color:#fff; border:none; border-radius:14px; font-family:'DM Sans',sans-serif; font-size:.95rem; font-weight:800; cursor:pointer; text-align:center; }
.mcs-checkout-btn:disabled { background:#93adb8; cursor:not-allowed; }

/* Orders screen */
.order-card { background:#fff; border-radius:16px; padding:18px; margin-bottom:12px; box-shadow:0 2px 8px rgba(0,70,94,.06); }

/* Thank you */
.ty-wrap { min-height:100dvh; display:flex; align-items:center; justify-content:center; background:var(--cream); padding:40px 24px; font-family:'DM Sans',sans-serif; }
.ty-card { background:#fff; border-radius:28px; padding:40px 36px; max-width:420px; width:100%; text-align:center; box-shadow:0 24px 60px rgba(0,70,94,.12); }
.ty-icon { width:72px; height:72px; border-radius:50%; background:linear-gradient(135deg,#27ae60,#2ecc71); display:flex; align-items:center; justify-content:center; font-size:2rem; margin:0 auto 20px; box-shadow:0 12px 32px rgba(39,174,96,.3); animation:bounceIn .5s cubic-bezier(.34,1.56,.64,1); }
.ty-title { font-size:2rem; font-weight:900; color:var(--dark); margin-bottom:8px; }
.ty-sub { font-size:.95rem; color:#50657a; line-height:1.5; margin-bottom:24px; }
.ty-detail { background:#f8fafc; border-radius:14px; padding:16px 20px; text-align:left; margin-bottom:24px; }
.ty-row { display:flex; justify-content:space-between; font-size:.85rem; padding:5px 0; }
.ty-row span:first-child { color:#7b8c9f; }
.ty-row span:last-child { font-weight:700; color:var(--dark); }
.ty-row.savings span:last-child { color:var(--green); font-size:.95rem; font-weight:900; }
.ty-row.paid span:first-child { font-weight:800; color:var(--dark); }
.ty-row.paid span:last-child { font-size:1rem; font-weight:900; }
.ty-note { font-size:.8rem; color:#aab4be; margin-bottom:20px; }
.ty-back-btn { background:var(--dark); color:#fff; border:none; border-radius:14px; padding:14px 28px; font-family:'DM Sans',sans-serif; font-size:.95rem; font-weight:800; cursor:pointer; width:100%; }
.ty-back-btn:hover { background:#005a7a; }
@keyframes bounceIn { from{transform:scale(.4);opacity:0;} to{transform:scale(1);opacity:1;} }
@keyframes spin { to{transform:rotate(360deg);} }

/* Toast */
.w-toast { position:fixed; left:50%; transform:translateX(-50%); background:var(--dark); color:#fff; padding:12px 20px; border-radius:14px; font-size:.88rem; font-weight:700; box-shadow:0 8px 28px rgba(0,0,0,.25); z-index:600; white-space:nowrap; max-width:calc(100vw - 48px); pointer-events:none; }

/* Loading */
.w-loading { min-height:100dvh; background:var(--cream); display:flex; align-items:center; justify-content:center; font-family:'DM Sans',sans-serif; }
.w-spinner { width:40px; height:40px; border-radius:50%; border:3px solid #e8edf2; border-top-color:var(--primary); animation:spin .7s linear infinite; margin:0 auto 12px; }
`;

// ── Meal Card ─────────────────────────────────────────────────────────────────

function MealCard({ meal, pricing, weekCount, cartCount, onAdd, onRemove }: {
  meal: CorpMeal;
  pricing: TierPricingConfig;
  weekCount: number;
  cartCount: number;   // how many of this meal are in cart
  onAdd: () => void;
  onRemove: () => void;
}) {
  const totalBefore = weekCount + cartCount;  // position the NEXT unit would land at
  const { tier, price } = getTierForPosition(totalBefore, pricing);
  const isCapped = tier === 'capped';
  const inCart   = cartCount > 0;
  const diet     = getDietType(meal);

  return (
    <div className={`meal-card${inCart ? ' in-cart' : ''}`}>
      <div className="meal-img-wrap">
        {meal.image_url
          ? <img className="meal-img" src={meal.image_url} alt={meal.display_name} />
          : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2.5rem', background:'linear-gradient(135deg,#e8d5c4,#d4c4b0)' }}>🍽️</div>
        }
        {diet && <span className={`diet-badge diet-badge-${diet === 'plant' ? 'plant' : 'meat'}`}>{diet === 'plant' ? 'Plant-Based' : 'Meat'}</span>}
        <span className="tier-badge" style={{ background: tierColor(tier) }}>{tierLabel(tier)}</span>
      </div>
      <div className="meal-body">
        <div className="meal-name">{meal.display_name}</div>
        {meal.short_description && <div className="meal-desc">{meal.short_description}</div>}
        <div className="macros-row">
          {meal.calories  && <span className="macro-chip cal">{meal.calories} cal</span>}
          {meal.protein_g && <span className="macro-chip pro">{meal.protein_g}g protein</span>}
          {meal.carbs_g   && <span className="macro-chip carb">{meal.carbs_g}g carbs</span>}
          {meal.fat_g     && <span className="macro-chip fat">{meal.fat_g}g fat</span>}
        </div>
        <div className="meal-footer">
          {inCart ? (
            <div className="qty-pill">
              <button className="qty-btn" onClick={onRemove}>−</button>
              <span className="qty-val">{cartCount} added</span>
              {isCapped
                ? <button className="qty-btn" style={{ opacity: .35, cursor: 'not-allowed' }}>+</button>
                : <button className="qty-btn" onClick={onAdd}>+</button>
              }
            </div>
          ) : isCapped ? (
            <button className="btn-capped">Weekly limit reached</button>
          ) : (
            <button className="btn-add" onClick={onAdd}>
              {price === 0 ? '+ Add — FREE' : `+ Add — $${price.toFixed(2)}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Thank You Screen ──────────────────────────────────────────────────────────

function ThankYouScreen({ data, onBack }: { data: ThankYouData; onBack: () => void }) {
  const youPaid   = data.employee_cost;
  const covered   = data.company_cost;
  const delDate   = fmtDate(nextDeliveryDate(data.delivery_day));
  return (
    <div className="ty-wrap">
      <style>{CSS}</style>
      <div className="ty-card">
        <div className="ty-icon">✓</div>
        <div className="ty-title">You're all set!</div>
        <div className="ty-sub">Order confirmed. See you on {data.delivery_day ?? 'delivery day'}!</div>
        <div className="ty-detail">
          {data.employee_name && (
            <div className="ty-row">
              <span>Name</span><span>{data.employee_name}</span>
            </div>
          )}
          <div className="ty-row">
            <span>Delivery</span><span>{delDate}</span>
          </div>
          {data.fridge_location && (
            <div className="ty-row">
              <span>Location</span><span>{data.fridge_location}</span>
            </div>
          )}
          <div className="ty-row">
            <span>Meals ({data.meal_names.length})</span>
            <span style={{ maxWidth:'180px', textAlign:'right', lineHeight:1.4 }}>{data.meal_names.join(', ')}</span>
          </div>
          {covered > 0 && (
            <div className="ty-row savings" style={{ marginTop:'8px', paddingTop:'8px', borderTop:'1px solid #edf1f5' }}>
              <span>Company covered</span><span>−${covered.toFixed(2)}</span>
            </div>
          )}
          <div className="ty-row paid" style={{ marginTop:'4px' }}>
            <span>You paid</span>
            <span style={{ color: youPaid === 0 ? 'var(--green)' : 'var(--dark)' }}>
              {youPaid === 0 ? 'Nothing 🎉' : `$${youPaid.toFixed(2)}`}
            </span>
          </div>
        </div>
        <p className="ty-note">Meals will be ready at the office fridge on delivery day.</p>
        <button className="ty-back-btn" onClick={onBack}>← Back to menu</button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CorporateWorkPage() {
  const router = useRouter();
  const [user,        setUser]        = useState<ReturnType<typeof getCorpUser>>(null);
  const [screen,      setScreen]      = useState<Screen>('menu');
  const [menu,        setMenu]        = useState<{
    week: string | null; week_start: string | null; weeks: WeekMenu[];
    meals: CorpMeal[]; pricing: TierPricingConfig | null;
    company: { name: string; fridge_location: string | null; delivery_day: string | null; max_meals_week: number } | null;
  } | null>(null);
  const [activeWeekIdx, setActiveWeekIdx] = useState(0);
  const [weekCount,   setWeekCount]   = useState(0);
  const [orders,      setOrders]      = useState<CorpOrder[]>([]);
  const [cart,        setCart]        = useState<CartItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [ordering,    setOrdering]    = useState(false);
  const [toast,       setToast]       = useState('');
  const [filter,      setFilter]      = useState('All');
  const [thankYou,    setThankYou]    = useState<ThankYouData | null>(null);
  const [cartOpen,    setCartOpen]    = useState(false);
  const [showReview,  setShowReview]  = useState(false);
  const [swapTarget,  setSwapTarget]  = useState<SwapTarget | null>(null);
  const [emailEdit,   setEmailEdit]   = useState('');
  const [emailSaving, setEmailSaving] = useState(false);

  const loadMenu = useCallback(async () => {
    setLoading(true);
    try {
      const [m, c] = await Promise.all([corpPortal.getMenu(), corpPortal.getWeekOrderCount()]);
      setMenu({
        week: m.week, week_start: m.week_start ?? null,
        weeks: m.weeks ?? [],
        meals: m.meals ?? [], pricing: m.pricing ?? null, company: m.company ?? null,
      });
      setActiveWeekIdx(0);
      setWeekCount(c.count);
    } catch (e: any) { showToast(e.message ?? 'Failed to load menu'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const u = getCorpUser();
    if (!u) { router.replace('/corporate/login'); return; }
    setUser(u);
    loadMenu();
  }, [router, loadMenu]);

  useEffect(() => {
    if (screen === 'orders') {
      corpPortal.getMyOrders().then(r => setOrders(r.orders ?? [])).catch(() => {});
    }
  }, [screen]);

  // Cart helpers
  function cartCountFor(mealId: string) { return cart.filter(c => c.meal.id === mealId).length; }
  const totalCartItems = cart.length;

  function addToCart(meal: CorpMeal) {
    if (!menu?.pricing) return;
    const pos = weekCount + cart.length;
    const { tier, price } = getTierForPosition(pos, menu.pricing);
    if (tier === 'capped') return;
    setCart(prev => [...prev, { meal, tier, price }]);
  }

  function removeFromCart(mealId: string) {
    setCart(prev => {
      const idx = prev.map(c => c.meal.id).lastIndexOf(mealId);
      if (idx === -1) return prev;
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
  }

  function openReview() {
    if (!cart.length || ordering) return;
    setShowReview(true);
  }

  async function confirmOrder() {
    if (!cart.length || ordering) return;
    setOrdering(true);
    try {
      const items = cart.map(c => ({ meal_id: c.meal.id }));
      const dd    = nextDeliveryDate(menu?.company?.delivery_day);
      const res   = await corpPortal.placeOrder(items, dd ?? undefined);
      setCart([]); setCartOpen(false); setShowReview(false);
      corpPortal.getWeekOrderCount(dd ?? undefined).then(r => setWeekCount(r.count)).catch(() => {});
      setThankYou({
        order_code:      res.order_code,
        employee_name:   res.summary?.employee_name ?? user?.name ?? null,
        employee_cost:   res.summary?.employee_cost ?? 0,
        company_cost:    res.summary?.company_cost  ?? 0,
        delivery_day:    res.summary?.delivery_day  ?? menu?.company?.delivery_day ?? null,
        fridge_location: res.summary?.fridge_location ?? menu?.company?.fridge_location ?? null,
        meal_names:      res.summary?.meal_names ?? cart.map(c => c.meal.display_name),
      });
      setScreen('thankyou');
    } catch (e: any) { showToast(e.message ?? 'Failed to place order'); setShowReview(false); }
    finally { setOrdering(false); }
  }

  async function saveEmail() {
    if (!emailEdit.trim() || emailSaving) return;
    setEmailSaving(true);
    try {
      await corpPortal.updateMyEmail(emailEdit.trim().toLowerCase());
      const updated = { ...getCorpUser()!, email: emailEdit.trim().toLowerCase() };
      setUser(updated);
      localStorage.setItem('corp_user', JSON.stringify(updated));
      showToast('Email updated');
    } catch (e: any) { showToast(e.message ?? 'Failed to update email'); }
    finally { setEmailSaving(false); }
  }

  async function handleSwap(newMealId: string) {
    if (!swapTarget) return;
    try {
      await corpPortal.swapOrderItem(swapTarget.order.id, swapTarget.itemId, newMealId);
      setSwapTarget(null);
      showToast('Meal swapped!');
      const r = await corpPortal.getMyOrders();
      setOrders(r.orders ?? []);
    } catch (e: any) { showToast(e.message ?? 'Swap failed'); }
  }

  function showToast(msg: string) {
    setToast(msg); setTimeout(() => setToast(''), 3500);
  }

  const pricing    = menu?.pricing;
  // Active week's meals (multi-week tab support)
  const activeMeals = menu?.weeks?.[activeWeekIdx]?.meals ?? menu?.meals ?? [];
  const categories  = ['All', ...Array.from(new Set(activeMeals.map(m => m.category ?? 'Other'))).filter(Boolean)];
  const filtered    = activeMeals.filter(m => filter === 'All' || m.category === filter);
  // Ordering deadline — day before delivery
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const delivIdx = days.indexOf(menu?.company?.delivery_day ?? '');
  const cutoffDay = delivIdx > 0 ? days[delivIdx - 1] : delivIdx === 0 ? 'Saturday' : null;
  const totalCost       = cart.reduce((s, c) => s + c.price, 0);
  const companyCovered  = pricing ? Math.max(0, cart.reduce((s, c) => s + ((pricing.full_price ?? c.price) - c.price), 0)) : 0;
  const initials        = user?.name?.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) ?? '?';

  // "Next meal" price chip — position of next item to be added
  const nextPos = weekCount + cart.length;
  const nextTier = pricing ? getTierForPosition(nextPos, pricing) : null;

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="w-loading">
      <style>{CSS}</style>
      <div style={{ textAlign: 'center' }}>
        <div className="w-spinner" />
        <p style={{ color: '#7b8c9f', fontSize: '.88rem' }}>Loading your menu…</p>
      </div>
    </div>
  );

  // ── Thank-you ────────────────────────────────────────────────────────────────
  if (screen === 'thankyou' && thankYou) {
    return <ThankYouScreen data={thankYou} onBack={() => { setThankYou(null); setScreen('menu'); }} />;
  }

  // ── Cart items for sidebar / sheet ───────────────────────────────────────────
  const cartItemsUniq = Array.from(new Map(cart.map(c => [c.meal.id, c])).values());

  return (
    <div className="work-shell">
      <style>{CSS}</style>

      {/* ── Topbar ── */}
      <div className="w-topbar">
        <div className="w-brand">
          <div className="w-brand-name">betterday <span>· {menu?.company?.name ?? 'for Work'}</span></div>
        </div>
        <div className="w-topbar-right">
          {cutoffDay && (
            <div className="w-next-chip" style={{ background: 'rgba(255,183,77,.15)', border: '1px solid rgba(255,183,77,.3)', color: 'rgba(255,255,255,.8)' }}>
              Order by <strong style={{ color: '#ffd54f' }}>{cutoffDay}</strong>
            </div>
          )}
          {nextTier && (
            <div className="w-next-chip">
              Next: <strong>{nextTier.price === 0 ? 'FREE' : `$${nextTier.price.toFixed(2)}`}</strong>
            </div>
          )}
          <div className="w-user-chip" onClick={() => setScreen('profile')}>
            <div className="w-avatar">{initials}</div>
            <div className="w-uname">{user?.name?.split(' ')[0] ?? 'Me'}</div>
          </div>
        </div>
      </div>

      {/* ── Week tabs row ── */}
      <div className="w-tabs-row">
        <div className="w-tabs-bar">
          {/* Multi-week menu tabs */}
          {(menu?.weeks?.length ? menu.weeks : [{ plan_id: 'now', week: menu?.week ?? 'This Week', week_start: menu?.week_start ?? '', meals: [] }]).map((w, i) => (
            <button key={w.plan_id} className={`w-tab${screen === 'menu' && activeWeekIdx === i ? ' active' : ''}`}
              onClick={() => { setScreen('menu'); setActiveWeekIdx(i); setFilter('All'); }}>
              {i === 0 ? '📋 This Week' : `Week ${i + 1}`}
              {w.week && <span className="w-tab-date">{w.week}</span>}
            </button>
          ))}
          <button className={`w-tab${screen === 'orders' ? ' active' : ''}`} onClick={() => setScreen('orders')}>
            📦 My Orders
          </button>
          <button className={`w-tab${screen === 'profile' ? ' active' : ''}`} onClick={() => setScreen('profile')}>
            👤 Profile
          </button>
        </div>
        {/* Pricing banner — desktop only */}
        {pricing && (
          <div className="w-inline-pricing">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <span className="w-pricing-company">{menu?.company?.name ?? 'Your Plan'}</span>
              <span className="w-pricing-label">Meal Benefits</span>
            </div>
            {pricing.free.meals > 0 && (<><span className="w-vsep" /><span className="w-tier-price" style={{ color: '#5fe49a' }}>{pricing.free.meals} FREE</span></>)}
            {pricing.tier1.meals > 0 && (<><span className="w-vsep" /><span className="w-tier-price">{pricing.tier1.meals} @ ${pricing.tier1.employeePrice.toFixed(2)}</span></>)}
            {pricing.tier2.meals > 0 && (<><span className="w-vsep" /><span className="w-tier-price">{pricing.tier2.meals} @ ${pricing.tier2.employeePrice.toFixed(2)}</span></>)}
            {pricing.tier3.meals > 0 && (<><span className="w-vsep" /><span className="w-tier-price">{pricing.tier3.meals} @ ${pricing.tier3.employeePrice.toFixed(2)}</span></>)}
          </div>
        )}
      </div>

      {/* ── Menu body ── */}
      <div className="w-body">
        <div className="w-scroll">
          <div className="w-inner">

            {/* ─ MENU screen ─ */}
            {screen === 'menu' && (
              <>
                {/* Category pills */}
                {categories.length > 1 && (
                  <div className="w-cat-wrap">
                    <div className="w-cat-inner">
                      {categories.map(c => (
                        <button key={c} className={`w-cat-btn${filter === c ? ' active' : ''}`} onClick={() => setFilter(c)}>{c}</button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Plan summary (mobile only — desktop has the topbar banner) */}
                {pricing && weekCount > 0 && (
                  <div className="w-plan-bar" style={{ display: 'flex' }}>
                    <span className="w-plan-lbl">This week:</span>
                    <span className="w-plan-pill" style={{ background: 'rgba(0,70,94,.08)', color: '#50657a' }}>{weekCount} ordered</span>
                    {menu?.company?.delivery_day && (
                      <span className="w-plan-lbl" style={{ marginLeft: 'auto', fontWeight: 400, color: '#7b8c9f' }}>Delivery: {menu.company.delivery_day}s</span>
                    )}
                  </div>
                )}

                {/* Empty state */}
                {!filtered.length && (
                  <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🍽️</div>
                    <p style={{ color: '#00465e', fontWeight: 800, fontSize: '1.1rem', marginBottom: '6px' }}>No menu this week yet</p>
                    <p style={{ color: '#7b8c9f', fontSize: '.85rem' }}>Check back soon — your meal plan will appear here once published.</p>
                  </div>
                )}

                {/* Meal grid */}
                <div className="w-meal-grid">
                  {filtered.map(meal => (
                    <MealCard
                      key={meal.id}
                      meal={meal}
                      pricing={pricing ?? meal.pricing}
                      weekCount={weekCount}
                      cartCount={cartCountFor(meal.id)}
                      onAdd={() => addToCart(meal)}
                      onRemove={() => removeFromCart(meal.id)}
                    />
                  ))}
                </div>
              </>
            )}

            {/* ─ ORDERS screen ─ */}
            {screen === 'orders' && (
              <>
                {!orders.length ? (
                  <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📦</div>
                    <p style={{ color: '#00465e', fontWeight: 800, fontSize: '1.1rem', marginBottom: '6px' }}>No orders yet</p>
                    <p style={{ color: '#7b8c9f', fontSize: '.85rem' }}>Your orders will appear here once you've placed your first order.</p>
                  </div>
                ) : orders.map(order => (
                  <div key={order.id} className="order-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <div>
                        <div style={{ fontWeight: 900, color: '#00465e', fontSize: '.95rem' }}>Order #{order.order_code}</div>
                        <div style={{ fontSize: '.72rem', color: '#7b8c9f' }}>
                          {order.delivery_date ? fmtDate(order.delivery_date.split('T')[0]) : new Date(order.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                      <span style={{ padding: '4px 10px', borderRadius: '999px', fontSize: '.72rem', fontWeight: 800, background: order.status === 'delivered' ? 'rgba(39,174,96,.1)' : 'rgba(78,162,253,.1)', color: order.status === 'delivered' ? '#27ae60' : '#4ea2fd', alignSelf: 'flex-start', textTransform: 'capitalize' }}>{order.status}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {order.items.map(item => (
                        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '.85rem', color: '#00465e', fontWeight: 600 }}>{item.meal_name}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '.7rem', fontWeight: 700, color: tierColor(item.tier), background: `${tierColor(item.tier)}18`, padding: '2px 7px', borderRadius: '999px' }}>{tierLabel(item.tier)}</span>
                            <span style={{ fontSize: '.82rem', fontWeight: 700, color: '#00465e' }}>{item.unit_price === 0 ? 'FREE' : `$${item.unit_price.toFixed(2)}`}</span>
                            {/* Swap button — only for pending orders */}
                            {order.status === 'pending' && (
                              <button onClick={() => setSwapTarget({ order, itemId: item.id, mealName: item.meal_name })}
                                style={{ fontSize: '.68rem', fontWeight: 700, color: '#4ea2fd', background: 'rgba(78,162,253,.1)', border: 'none', borderRadius: '6px', padding: '2px 8px', cursor: 'pointer' }}>
                                Swap
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {(order.company_cost > 0 || order.employee_cost >= 0) && (
                      <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f0f0f0' }}>
                        {order.company_cost > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', color: '#7b8c9f', marginBottom: '4px' }}>
                            <span>Company covered</span><span style={{ color: '#27ae60' }}>−${order.company_cost.toFixed(2)}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.85rem', fontWeight: 800, color: '#00465e' }}>
                          <span>You paid</span>
                          <span>{order.employee_cost === 0 ? 'Nothing 🎉' : `$${order.employee_cost.toFixed(2)}`}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}

            {/* ─ PROFILE screen ─ */}
            {screen === 'profile' && (
              <div style={{ maxWidth: '480px', margin: '0 auto' }}>
                <div style={{ background: '#fff', borderRadius: '20px', padding: '28px', marginBottom: '14px', boxShadow: '0 2px 12px rgba(0,70,94,.08)' }}>
                  {/* Avatar + name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                    <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#4ea2fd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', fontWeight: 900, color: '#fff', flexShrink: 0 }}>{initials}</div>
                    <div>
                      <div style={{ fontWeight: 900, fontSize: '1.1rem', color: '#00465e' }}>{user?.name}</div>
                      <div style={{ fontSize: '.78rem', color: '#7b8c9f' }}>{user?.email}</div>
                    </div>
                  </div>
                  {/* Details */}
                  {[
                    { label: 'Company', value: menu?.company?.name ?? user?.company_id },
                    { label: 'Delivery day', value: menu?.company?.delivery_day ?? '—' },
                    { label: 'Pick-up location', value: menu?.company?.fridge_location ?? '—' },
                    { label: 'Weekly meal allowance', value: menu?.company?.max_meals_week ? `${menu.company.max_meals_week} meals` : '—' },
                    { label: 'This week ordered', value: `${weekCount} meal${weekCount !== 1 ? 's' : ''}` },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #f0f4f8', fontSize: '.88rem' }}>
                      <span style={{ color: '#7b8c9f' }}>{label}</span>
                      <span style={{ fontWeight: 700, color: '#00465e' }}>{value}</span>
                    </div>
                  ))}
                </div>

                {/* Change email */}
                {user?.role === 'corp_employee' && (
                  <div style={{ background: '#fff', borderRadius: '20px', padding: '24px', marginBottom: '14px', boxShadow: '0 2px 12px rgba(0,70,94,.08)' }}>
                    <div style={{ fontWeight: 800, fontSize: '.95rem', color: '#00465e', marginBottom: '12px' }}>Change Email</div>
                    <input
                      type="email"
                      value={emailEdit}
                      onChange={e => setEmailEdit(e.target.value)}
                      placeholder={user.email ?? 'New email address'}
                      style={{ width: '100%', padding: '12px 14px', border: '2px solid #e8edf2', borderRadius: '10px', fontSize: '.9rem', fontFamily: "'DM Sans',sans-serif", color: '#00465e', background: '#f8fafc', outline: 'none', boxSizing: 'border-box', marginBottom: '10px' }}
                    />
                    <button onClick={saveEmail} disabled={emailSaving || !emailEdit}
                      style={{ width: '100%', padding: '13px', background: emailSaving ? '#93adb8' : '#00465e', color: '#fff', border: 'none', borderRadius: '10px', fontFamily: "'DM Sans',sans-serif", fontSize: '.9rem', fontWeight: 800, cursor: emailSaving ? 'default' : 'pointer' }}>
                      {emailSaving ? 'Saving…' : 'Update Email'}
                    </button>
                  </div>
                )}

                {/* Logout */}
                <button onClick={() => { clearCorpAuth(); router.replace('/corporate/login'); }}
                  style={{ width: '100%', padding: '14px', background: 'transparent', color: '#e74c3c', border: '2px solid rgba(231,76,60,.25)', borderRadius: '14px', fontFamily: "'DM Sans',sans-serif", fontSize: '.9rem', fontWeight: 800, cursor: 'pointer' }}>
                  Sign Out
                </button>
              </div>
            )}

          </div>{/* w-inner */}
        </div>{/* w-scroll */}

        {/* ── Desktop side cart ── */}
        <aside className="side-cart">
          <div className="sc-head">
            <div className="sc-title">Your Order</div>
            <div className="sc-delivery">
              {weekCount > 0 ? `${weekCount} ordered this week` : 'Add meals to get started'}
              {menu?.company?.delivery_day ? ` · ${menu.company.delivery_day} delivery` : ''}
            </div>
          </div>
          {!totalCartItems ? (
            <div className="sc-empty">Add meals from the menu to build your order</div>
          ) : (
            <div className="sc-items">
              {cartItemsUniq.map(ci => (
                <div key={ci.meal.id} className="sc-item-row">
                  <div className="sc-thumb">
                    {ci.meal.image_url && <img src={ci.meal.image_url} alt={ci.meal.display_name} />}
                  </div>
                  <div className="sc-item-info">
                    <div className="sc-item-name">{ci.meal.display_name}</div>
                    <div className="sc-item-meta">{tierLabel(ci.tier)}{cartCountFor(ci.meal.id) > 1 ? ` · ×${cartCountFor(ci.meal.id)}` : ''}</div>
                  </div>
                  <div className="sc-item-price">{fmtPrice(ci.price)}</div>
                  <button className="sc-remove" onClick={() => removeFromCart(ci.meal.id)}>×</button>
                </div>
              ))}
            </div>
          )}
          {totalCartItems > 0 && (
            <div className="sc-footer">
              {companyCovered > 0 && (
                <div className="sc-subtotal-row sc-savings-row">
                  <span>Company covers</span><span>−${companyCovered.toFixed(2)}</span>
                </div>
              )}
              <div className="sc-total-row">
                <span>{totalCartItems} meal{totalCartItems > 1 ? 's' : ''}</span>
                <span className="sc-total-amt" style={{ color: totalCost === 0 ? '#27ae60' : '#00465e' }}>
                  {totalCost === 0 ? 'FREE 🎉' : `$${totalCost.toFixed(2)}`}
                </span>
              </div>
              <button className="sc-checkout-btn" onClick={openReview} disabled={ordering}>
                {ordering ? 'Placing order…' : 'Place Order →'}
              </button>
              <button className="sc-clear-btn" onClick={() => setCart([])}>Clear cart</button>
            </div>
          )}
        </aside>
      </div>{/* w-body */}

      {/* ── Mobile cart bar ── */}
      {screen === 'menu' && (
        <div className="mob-cart-bar">
          {cartOpen && totalCartItems > 0 && (
            <div className="mob-cart-sheet">
              <div className="mcs-drag-handle" />
              <div className="mcs-head">
                <div className="mcs-title">Your Order</div>
                {menu?.company?.delivery_day && <div className="mcs-delivery">{menu.company.delivery_day} delivery · {menu.company.fridge_location ?? 'Office fridge'}</div>}
              </div>
              <div className="mcs-items">
                {cartItemsUniq.map(ci => (
                  <div key={ci.meal.id} className="mcs-item-row">
                    <div className="mcs-thumb">
                      {ci.meal.image_url && <img src={ci.meal.image_url} alt={ci.meal.display_name} />}
                    </div>
                    <div className="mcs-item-info">
                      <div className="mcs-name">{ci.meal.display_name}</div>
                      <div className="mcs-item-meta">{tierLabel(ci.tier)}{cartCountFor(ci.meal.id) > 1 ? ` · ×${cartCountFor(ci.meal.id)}` : ''}</div>
                    </div>
                    <div className="mcs-price">{fmtPrice(ci.price)}</div>
                    <button className="mcs-rm" onClick={() => removeFromCart(ci.meal.id)}>×</button>
                  </div>
                ))}
              </div>
              {companyCovered > 0 && (
                <div className="mcs-subtotals">
                  <div className="mcs-subtotal-row mcs-savings-row">
                    <span>Company covers</span><span>−${companyCovered.toFixed(2)}</span>
                  </div>
                </div>
              )}
              <div className="mcs-total-row">
                <span>{totalCartItems} meal{totalCartItems > 1 ? 's' : ''}</span>
                <span style={{ color: totalCost === 0 ? '#27ae60' : '#00465e' }}>
                  {totalCost === 0 ? 'FREE 🎉' : `$${totalCost.toFixed(2)}`}
                </span>
              </div>
              <button className="mcs-checkout-btn" onClick={openReview} disabled={ordering}>
                {ordering ? 'Placing order…' : 'Place Order →'}
              </button>
            </div>
          )}
          <div className="mob-cart-toggle" onClick={() => setCartOpen(o => totalCartItems > 0 ? !o : false)}>
            <div className="mob-toggle-left">
              <span className="mob-cart-badge">{totalCartItems || '0'}</span>
              <span className="mob-toggle-label">
                {totalCartItems > 0 ? `${totalCartItems} meal${totalCartItems > 1 ? 's' : ''} in cart` : 'Your cart is empty'}
              </span>
            </div>
            <span className="mob-cart-total-label" style={{ color: totalCost === 0 && totalCartItems > 0 ? '#ffd54f' : '#fff' }}>
              {totalCartItems === 0 ? '' : totalCost === 0 ? 'FREE ✓' : `$${totalCost.toFixed(2)}`}
            </span>
            {totalCartItems > 0 && (
              <button className="mob-review-btn" onClick={e => { e.stopPropagation(); openReview(); }}>Review →</button>
            )}
          </div>
        </div>
      )}

      {/* ── Order Review Modal ── */}
      {showReview && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px', paddingTop: 'min(8vh,80px)', fontFamily: "'DM Sans',sans-serif" }}
          onClick={e => e.target === e.currentTarget && setShowReview(false)}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.72)', backdropFilter: 'blur(3px)' }} onClick={() => setShowReview(false)} />
          <div style={{ position: 'relative', zIndex: 1, background: 'var(--cream)', borderRadius: '24px', width: '100%', maxWidth: '480px', boxShadow: '0 32px 80px rgba(0,0,0,.35)', overflow: 'hidden', maxHeight: '90vh', overflowY: 'auto' }}>
            <button onClick={() => setShowReview(false)} style={{ position: 'absolute', top: '12px', right: '14px', border: 'none', background: 'rgba(0,70,94,.1)', color: '#00465e', width: '30px', height: '30px', borderRadius: '50%', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>×</button>
            <div style={{ padding: '26px 26px 14px' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#00465e', letterSpacing: '-.3px' }}>Review Order</div>
              {menu?.company?.delivery_day && (
                <div style={{ fontSize: '.82rem', color: '#7b8c9f', marginTop: '4px' }}>
                  {menu.company.delivery_day} delivery {menu.company.fridge_location ? `· ${menu.company.fridge_location}` : ''}
                </div>
              )}
            </div>
            <div style={{ background: '#fff', margin: '0 18px 14px', borderRadius: '16px', padding: '16px 18px', boxShadow: '0 3px 12px rgba(0,0,0,.06)' }}>
              {cart.map((ci, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '44px 1fr auto', gap: '10px', alignItems: 'center', padding: '8px 0', borderBottom: i < cart.length - 1 ? '1px solid rgba(0,70,94,.06)' : 'none' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '10px', overflow: 'hidden', background: '#eee', flexShrink: 0 }}>
                    {ci.meal.image_url && <img src={ci.meal.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: '.87rem', fontWeight: 700, color: '#00465e' }}>{ci.meal.display_name}</div>
                    <div style={{ fontSize: '.75rem', color: tierColor(ci.tier), fontWeight: 700 }}>{tierLabel(ci.tier)}</div>
                  </div>
                  <div style={{ fontSize: '.9rem', fontWeight: 800, color: '#00465e' }}>{ci.price === 0 ? 'FREE' : `$${ci.price.toFixed(2)}`}</div>
                </div>
              ))}
            </div>
            {companyCovered > 0 && (
              <div style={{ margin: '0 18px 14px', background: '#eaf7ef', borderRadius: '12px', padding: '14px 16px' }}>
                <div style={{ fontSize: '.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.6px', color: '#27ae60', marginBottom: '7px' }}>Your Benefit</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.82rem', padding: '3px 0', color: '#1a7a46' }}>
                  <span>Company covers</span><span style={{ fontWeight: 700 }}>−${companyCovered.toFixed(2)}</span>
                </div>
              </div>
            )}
            <div style={{ padding: '10px 26px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: '1rem', fontWeight: 800, color: '#00465e' }}>You pay</span>
              <span style={{ fontSize: '1.5rem', fontWeight: 900, color: totalCost === 0 ? '#27ae60' : '#00465e' }}>{totalCost === 0 ? 'FREE 🎉' : `$${totalCost.toFixed(2)}`}</span>
            </div>
            <div style={{ padding: '10px 26px 0' }}>
              <button onClick={confirmOrder} disabled={ordering} style={{ width: '100%', padding: '16px', background: ordering ? '#c5d0d8' : '#00465e', color: '#fff', border: 'none', borderRadius: '14px', fontFamily: "'DM Sans',sans-serif", fontSize: '1.05rem', fontWeight: 900, cursor: ordering ? 'not-allowed' : 'pointer', boxShadow: ordering ? 'none' : '0 6px 20px rgba(0,70,94,.3)', transition: '.15s' }}>
                {ordering ? 'Placing order…' : 'Confirm Order →'}
              </button>
            </div>
            <p style={{ padding: '10px 22px 20px', fontSize: '.7rem', color: '#bbb', textAlign: 'center' }}>
              Order cutoff: {cutoffDay ?? 'the day before delivery'}
            </p>
          </div>
        </div>
      )}

      {/* ── Meal Swap Modal ── */}
      {swapTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 500, display: 'flex', alignItems: 'flex-end', fontFamily: "'DM Sans',sans-serif" }}
          onClick={e => e.target === e.currentTarget && setSwapTarget(null)}>
          <div style={{ background: '#fff', borderRadius: '24px 24px 0 0', width: '100%', padding: '28px 24px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 900, fontSize: '1.1rem', color: '#00465e', marginBottom: '6px' }}>Swap a Meal</div>
            <p style={{ fontSize: '.85rem', color: '#7b8c9f', marginBottom: '18px' }}>
              Replacing: <strong style={{ color: '#00465e' }}>{swapTarget.mealName}</strong>
            </p>
            {activeMeals.length ? activeMeals.map(meal => (
              <button key={meal.id} onClick={() => handleSwap(meal.id)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px', background: '#f8fafc', border: '2px solid #e8edf2', borderRadius: '12px',
                marginBottom: '8px', cursor: 'pointer', textAlign: 'left', fontFamily: "'DM Sans',sans-serif",
              }}>
                {meal.image_url && <img src={meal.image_url} alt={meal.display_name} style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover', flexShrink: 0 }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: '.9rem', color: '#00465e' }}>{meal.display_name}</div>
                  <div style={{ fontSize: '.72rem', color: '#7b8c9f' }}>{meal.category}</div>
                </div>
              </button>
            )) : (
              <p style={{ color: '#7b8c9f', fontSize: '.85rem' }}>No meals available for swapping this week.</p>
            )}
            <button onClick={() => setSwapTarget(null)} style={{ width: '100%', padding: '13px', background: 'transparent', color: '#00465e', border: '2px solid #e0e8f0', borderRadius: '14px', fontFamily: "'DM Sans',sans-serif", fontSize: '.9rem', fontWeight: 700, cursor: 'pointer', marginTop: '8px' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="w-toast" style={{ bottom: screen === 'menu' && totalCartItems > 0 ? '80px' : '24px' }}>
          {toast}
        </div>
      )}
    </div>
  );
}
