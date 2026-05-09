# Production Deploy Guide

Стек: Render (backend) + Vercel (frontend) + Neon (Postgres) + Resend (email).
Все на free tier.

## 1. Neon Postgres (5 хв)

1. Зареєструйся на [neon.tech](https://neon.tech) (можна через GitHub).
2. Create new project → name `chat-app`, region `EU Central` (Frankfurt — близько до Render Frankfurt).
3. Скопіюй **connection string** з форматом:
   ```
   postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require
   ```
4. **Збережи його** — потрібен на кроці 3.

> **Важливо:** Neon free tier — 0.5 GB, але pause-иться після 5 хв inactivity.
> Cold start ~1-2 сек. Для нашого пет-проекту це OK.

## 2. Resend для email (5 хв)

1. Зареєструйся на [resend.com](https://resend.com).
2. **Verify a domain** або просто використовуй sandbox-домен `onboarding@resend.dev` для тестування.
3. **API Keys** → Create API key → скопіюй (формат `re_xxx`).
4. Збережи API key і `noreply@your-verified-domain.com` (або `onboarding@resend.dev` для тесту).

## 3. Render — backend (15 хв)

1. Зареєструйся на [render.com](https://render.com) через GitHub.
2. **New +** → **Web Service** → Connect repo → вибери свій chat-app.
3. Налаштування:
   - **Name:** `chat-yourname-api` (буде https://chat-yourname-api.onrender.com)
   - **Region:** `Frankfurt`
   - **Branch:** `main`
   - **Root Directory:** `server`
   - **Runtime:** `Node`
   - **Build Command:**
     ```
     npm install --include=dev && cd ../shared && npm install --include=dev && cd ../server && npx prisma generate && npm run build
     ```
   - **Start Command:** `npm run start:migrate`
   - **Plan:** `Free`

4. **Advanced** → Environment Variables. Додай:

   ```
   NODE_ENV=production
   LOG_LEVEL=info

   DATABASE_URL=<вставити з Neon>

   CORS_ORIGIN=https://chat-yourname.vercel.app  # ← тут URL з кроку 4 (поки не маєш — постав placeholder, оновиш потім)
   CLIENT_URL=https://chat-yourname.vercel.app

   JWT_ACCESS_SECRET=<openssl rand -base64 48>
   JWT_REFRESH_SECRET=<openssl rand -base64 48>  # ОБОВ'ЯЗКОВО інший
   JWT_ACCESS_EXPIRES_IN=15m
   JWT_REFRESH_EXPIRES_IN=30d

   COOKIE_DOMAIN=
   # Лиши порожнім — у нас cross-domain через sameSite=none

   SMTP_HOST=smtp.resend.com
   SMTP_PORT=587
   SMTP_USER=resend
   SMTP_PASS=<твій Resend API key>
   EMAIL_FROM="Chat App <onboarding@resend.dev>"
   # У prod заміни onboarding@resend.dev на власний verified email
   ```

5. **Create Web Service** → стартує deploy. ~5-10 хвилин на перший build.
6. Health check: відкрий `https://chat-yourname-api.onrender.com/api/v1/health` → має повернути `{"status":"ok",...}`.

> **Free tier нюанси:**
> - Sleeps після 15 хв inactivity → cold start ~30 сек
> - Якщо хочеш постійно alive — налаштуй [UptimeRobot](https://uptimerobot.com) ping кожні 5 хв на `/api/v1/health`. Безкоштовно.

## 4. Vercel — frontend (10 хв)

1. Зареєструйся на [vercel.com](https://vercel.com) через GitHub.
2. **Add New** → **Project** → Import свій chat-app.
3. **Framework Preset:** Next.js (auto-detect).
4. **Root Directory:** `client`.
5. **Environment Variables** (Production):

   ```
   NEXT_PUBLIC_API_URL=https://chat-yourname-api.onrender.com
   NEXT_PUBLIC_SOCKET_URL=https://chat-yourname-api.onrender.com
   ```

   (БЕЗ trailing slash)

6. **Deploy** → ~2-3 хв.
7. Vercel дасть тобі URL типу `chat-yourname.vercel.app`.

## 5. Зворотний зв'язок між Render і Vercel

Тепер коли знаєш реальний Vercel URL — **повернись у Render Dashboard**:
- Environment → відредагуй:
   - `CORS_ORIGIN=https://chat-yourname.vercel.app` (заміни placeholder)
   - `CLIENT_URL=https://chat-yourname.vercel.app`
- Manual Deploy → Clear build cache & deploy

> Render передеплоїться (~1-2 хв) з новими змінними.

## 6. Перевірка

1. Відкрий `https://chat-yourname.vercel.app`
2. Реєстрація → перевір email (від Resend) → verify
3. Логін → відкрий чат → надішли повідомлення
4. Other browser → інкогніто → залогінься як інший юзер → chat real-time

### Якщо щось не працює

**Cookies не зберігаються після login:**
- DevTools → Application → Cookies → перевір що `accessToken` є на vercel.app
- Якщо немає — найімовірніше CORS_ORIGIN не точно збігається з Vercel URL (зайвий `/`, http замість https). Перевір **точно** до символу.
- `Network` → POST `/auth/login` → response headers → `Set-Cookie:` → має бути `SameSite=None; Secure`

**WebSocket connect_error:**
- DevTools → Network → WS → клік на socket.io з'єднання → Headers
- Якщо `403` — CORS_ORIGIN не той
- Якщо `401` — cookies не дойшли (див. пункт вище)

**Database errors при register:**
- Найчастіше — забув запустити migrations. Перевір Render logs → має бути `Applied migration ...`.
- Якщо ні — Manual Deploy → Clear build cache.

**Cold start на 30 сек:**
- Вікриваєш сторінку, нічого не відбувається, потім різко працює — це Render free прокинувся
- Workaround: UptimeRobot ping. Або купити Render Hobby ($7/міс).

## 7. Що далі (не обов'язково для початку)

- **Custom domain:** купити domain → налаштувати у Render (`api.your-domain.com`) і Vercel (`chat.your-domain.com`)
- **Redis:** [Upstash](https://upstash.com) free tier → встанови `REDIS_URL` у Render → Socket.io почне використовувати Redis adapter (потрібно якщо Render масштабується на 2+ інстансів)
- **Monitoring:** [Better Stack](https://betterstack.com) для logs aggregation
- **Auto-deploy:** Render і Vercel auto-deploy при push у main гілку GitHub за замовчуванням
