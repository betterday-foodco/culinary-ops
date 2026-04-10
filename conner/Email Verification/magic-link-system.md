# Magic Link System — BetterDay Corporate App

**Repo:** `betterday-foodco/betterday-app`
**File:** `app.py`
**Purpose:** Passwordless sign-in for corporate employees to access the `/work` meal-ordering portal.

---

## Architecture overview

The corporate app runs a **dual-path magic link system**: Flask is the fast path (generates token, sends email, verifies), and Google Apps Script (GAS) is the fallback + audit log. The two stay in sync via a `token_override` mechanism.

```
Client → Flask /api endpoint
           │
           ├─ create_magic_token:
           │    1. Flask generates token
           │    2. Flask stores token in memory (_token_store)
           │    3. Flask sends email via Gmail SMTP
           │    4. Background thread tells GAS to log the token (audit only)
           │
           └─ verify_magic_token:
                1. Flask checks its own in-memory store (fast)
                2. If miss → fall through to GAS (handles old tokens)
                3. On hit → GAS lookup for employee + company data
```

---

## Send path

### 1. Token generation
```python
token = secrets.token_hex(32)                       # 64-char hex
sign_in_url = f"{APP_BASE_URL}/work?token={token}&co={company_id}"
```

### 2. Token storage (in-memory, Flask process)
```python
_token_store      = {}                    # token → {email, company_id, created_at, used}
_token_store_lock = threading.Lock()
_TOKEN_TTL        = 900                   # 15 minutes
```
- Thread-safe via `threading.Lock()`
- One-shot — `used` flag flips true on first verify
- 15-minute TTL enforced on verify

### 3. Email delivery — `_send_email()`
- **Transport:** Gmail SMTP (`smtp.gmail.com:587`, STARTTLS)
- **Credentials:** `SMTP_EMAIL` / `SMTP_PASSWORD` env vars (Gmail app password)
- **From:** `BetterDay <{SMTP_EMAIL}>`
- **Format:** MIMEMultipart alternative (plain + HTML)
- **Failure mode:** returns `False` on exception, logs warning, caller falls through to GAS

### 4. HTML body — `_build_magic_link_email()`
- Branded template (Cream Logo from `/static/Cream%20Logo.png`)
- Configurable header color + label (e.g. `FOR WORK` blue variant)
- Configurable CTA button text + color
- Includes safety copy: "If you didn't request this, you can safely ignore it"
- Reply-to guidance: "Questions? Reply to this email."

### 5. GAS audit sync (background, non-blocking)
```python
def _bg_store():
    _gas_post({
        'action': 'create_magic_token',
        'email': email,
        'company_id': company_id,
        'token_override': token,        # keeps Flask + GAS in sync
        'sign_in_url': sign_in_url,
        'skip_email': True              # Flask already sent it
    }, timeout=15)
threading.Thread(target=_bg_store, daemon=True).start()
```
The `token_override` + `skip_email` combo means GAS logs the same token Flask issued, without re-sending the email.

### 6. SMTP fallback
If `SMTP_EMAIL`/`SMTP_PASSWORD` are unset or `_send_email()` raises, the request falls through to the existing GAS `requests.post` path with `payload['token_override']` and `payload['sign_in_url']` injected — GAS sends the email in that case.

---

## Verify path

```python
# 1. Check Flask's in-memory store first (fast, no network)
result = _verify_magic_token_flask(token)
if result:
    email, company_id = result
    # 2. Fetch employee + company data from GAS
    emp_data  = _gas_post({'action': 'get_employee_by_email', ...})
    comp_data = _cached_get_company(company_id)
    return jsonify({'valid': True, 'employee': employee, 'company': company})
# 3. Miss — fall through to GAS (handles tokens from old emails before Flask took over)
```

`_verify_magic_token_flask()` enforces three invariants:
- Token exists
- Token not already `used`
- `time.time() - created_at <= _TOKEN_TTL`

On success it flips `used = True` atomically under the lock.

---

## Config / env vars

| Var | Purpose |
|---|---|
| `SMTP_EMAIL` | Gmail account for sending |
| `SMTP_PASSWORD` | Gmail app password |
| `APP_BASE_URL` | Used to build `sign_in_url` and logo URL |
| `CULINARY_SYNC_KEY` | Unrelated — culinary-ops sync |
| `FLASK_SECRET_KEY` | Flask session secret |

---

## Known characteristics / gotchas

1. **Tokens live in process memory only.** A Flask restart (Render redeploy) invalidates all outstanding links. Acceptable given the 15-min TTL, but worth knowing during deploys.
2. **No rate limiting.** Anyone who knows a company email can trigger unlimited magic link sends. Worth adding if abuse becomes a concern.
3. **GAS fallback has different code paths.** If Flask's SMTP works, GAS only stores the token. If Flask's SMTP fails, GAS also sends the email — and GAS's email template may not match Flask's branded one.
4. **Token is passed as a URL query param** (`/work?token=…&co=…`). Standard practice for magic links, but means the token can appear in HTTP referrer headers or server logs if not scrubbed.
5. **One-shot enforcement is local to Flask.** If the same token ends up in both Flask's store and GAS's sheet, a user could (in theory) verify once via each. In practice Flask always checks first so this is only a risk if Flask's store is cleared between verify attempts.

---

## Where to look

| Concern | Location |
|---|---|
| Token generation + send | `app.py` — `create_magic_token` branch (~line 270) |
| Token verify | `app.py` — `verify_magic_token` branch (~line 297) |
| In-memory store | `app.py:128` — `_token_store`, `_store_magic_token`, `_verify_magic_token_flask` |
| Email transport | `app.py:71` — `_send_email()` |
| HTML template | `app.py:95` — `_build_magic_link_email()` |
| GAS backend | `gas/backend.gs` (audit + fallback email) |
