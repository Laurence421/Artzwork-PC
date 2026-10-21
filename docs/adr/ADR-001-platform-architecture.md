# ADR-001: Platform architecture for the multi-store builder

**Status:** Proposed
**Date:** 2026-10-20
**Deciders:** Project owner (Laurence421)

## Amendment 1 (2026-10-20): single client

The platform is built for **one client**, so it runs exactly one store:

- **One seller account.** Only the email in `private.config` (`seller_email`) can create the store, and only once. The database enforces this with a unique index on a constant, so a second store can't exist. Everyone else who signs up is a customer.
- **Addresses.** The shop is the home page (`/`, `/products`, `/cart`, …) instead of `/store/[slug]`, and the dashboard is `/dashboard` instead of `/dashboard/[storeSlug]`.
- **Unchanged underneath.** Tables keep `store_id` and the security rules stay as designed below. Going back to many sellers later means dropping the single-store index and restoring the slug routes; no data changes.

The rest of this ADR describes the original multi-store design. Where it mentions `/store/[slug]` or many sellers, read it with this amendment in mind.

## Context

ArtzworkPC lets sellers create their own branded online stores. It has two sides:

- **Seller dashboard (private):** onboarding, sales overview, branding with a live preview, products, categories and labels, orders, customers, payment and shipping settings.
- **Public storefront:** each store lives at `/store/[slug]` with the seller's branding. It has a catalog, a cart kept in the browser, guest checkout, order tracking, and optional customer accounts.

Forces at play:

- **Multi-tenancy is the core risk.** One seller must never see or change another seller's data. The brief already names Row Level Security (RLS) as the mechanism.
- **Small team, fast delivery.** Managed services are preferred over running our own infrastructure.
- **Local payments.** Cash on delivery, GCash and bank transfer start as *manual* methods: the customer pays outside the site and the seller marks the order as paid. No payment gateway is needed for v1.
- **Seller changes must show up right away** on the storefront (prices, labels, colors, logo).
- **Orders are a historical record.** Prices and names are copied into the order when it is placed.
- **Cost:** start on free or low tiers and keep a clear upgrade path.

## Decision

Build **one Next.js (App Router, TypeScript) application** that serves both the dashboard and the storefront, backed by **Supabase**: Postgres, Auth, Storage and Realtime. Host the app on **Vercel**.

Use a **shared database with a `store_id` column on every tenant table**, enforced by **Postgres RLS**. Every public write that touches several rows (placing an order, changing an order's status, looking up an order to track it) goes through a **Postgres function (RPC)**. Those functions recalculate prices and check stock on the server. The client never writes to the order tables directly.

```mermaid
flowchart LR
  subgraph Browser
    SF[Storefront /store/slug<br/>cart in localStorage]
    DB[Seller dashboard /dashboard/...]
  end
  subgraph Vercel["Next.js app (Vercel)"]
    RSC[Server components<br/>cached by store tag]
    SA[Server actions<br/>revalidateTag store:id]
  end
  subgraph Supabase
    AUTH[Auth]
    PG[(Postgres + RLS)]
    RPC[RPC: place_order,<br/>update_order_status,<br/>get_order_by_token]
    ST[Storage: store-assets]
    RT[Realtime: new orders]
  end
  SF --> RSC --> PG
  SF -- checkout --> RPC
  DB --> SA --> PG
  SA --> RPC
  DB -. live preview iframe + postMessage .-> SF
  DB <-. subscribe .- RT
  SF & DB --> ST
  DB & SF --> AUTH
```

## Options Considered

### Option A: Next.js + Supabase, shared schema with RLS (recommended)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low to medium. There is no separate API server, but RLS policies and SQL functions must be written carefully. |
| Cost | Free to start. Supabase Pro costs $25/mo and Vercel Pro $20/mo once live; the Vercel Hobby plan doesn't allow commercial use. |
| Scalability | One Postgres database comfortably handles thousands of stores with `(store_id, …)` indexes. Large stores can move to a bigger compute tier. |
| Team familiarity | Assumed to be TypeScript/React. SQL and RLS are the new skills to learn. |

**Pros:** The brief's RLS requirement is built in. Auth, file storage, image transforms and realtime come in one service. Tenant isolation is enforced in the database, so a forgotten `WHERE store_id = …` in app code cannot leak data. Real Postgres gives transactions, constraints and reporting queries.
**Cons:** Business logic is split between TypeScript and SQL functions. A mistake in an RLS policy is a security bug, so policies need tests. We depend on a single vendor, although it is plain Postgres underneath and can be moved.

### Option B: Next.js + Postgres + Prisma/Drizzle + Auth.js, tenancy checked in app code

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium to high. We would build the auth flows, file uploads and image handling ourselves. |
| Cost | Similar: Neon or Railway Postgres, S3/R2 for files. |
| Scalability | Same as A. |
| Team familiarity | ORMs are familiar to most TypeScript developers. |

**Pros:** All logic lives in TypeScript. No vendor lock-in.
**Cons:** Tenant isolation depends on every query remembering its filter, which is the exact failure the brief wants to prevent. More work before the first release.

### Option C: Firebase (Firestore + security rules)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium. Security rules are expressive, but relational queries are awkward. |
| Cost | Charged per read and write. Catalog browsing reads a lot, so costs are hard to predict. |
| Scalability | Excellent for reads. Aggregations (sales totals, reports) need extra counters or functions. |
| Team familiarity | Varies. |

**Pros:** Realtime by default. Generous free tier.
**Cons:** Placing an order touches several documents: stock, a counter and the order itself. Reports such as "sales this month" and "customers with order history" need denormalized copies that have to be kept in sync. Filtering by price range combined with category runs into index limits.

### Sub-decision: tenancy model

| Model | Verdict |
|-------|---------|
| **Shared tables + `store_id` + RLS** | **Chosen.** Simple to run and works for any number of stores. |
| Schema per store | Migrations run N times, the connection pool fragments, and it isn't supported by Supabase's tooling. |
| Database per store | Only worth it for enterprise isolation. Too expensive here. |

## Trade-off Analysis

- **Isolation versus convenience.** A puts isolation in the database, which costs some SQL work. B keeps everything in TypeScript but makes isolation depend on every developer remembering a filter. The brief explicitly asks for RLS, so A wins.
- **Relational versus document data.** Orders, stock, reports and "customers who ordered" are relational and transactional. Postgres handles them natively, while Firestore needs workarounds for each one. This rules out C.
- **One app versus two.** A single Next.js app shares UI components between the storefront and the live preview. It also gives one deployment and one type system. Splitting the dashboard and storefront into separate apps only becomes worthwhile if they need different scaling or release schedules, and nothing in the brief suggests that.

## Design details

### Roles and auth

- **Supabase Auth** (email/password plus magic link) is shared by sellers and customers. One person can be both.
- **Seller access** is defined by `store_members(store_id, user_id, role)`. Roles are `owner` and, later, `staff`. This covers "manages one or more stores".
- **Platform admin** (later) is a `role: 'platform_admin'` claim in `app_metadata`, which only the service role can set. `stores.status` takes the values `pending`, `active` or `suspended`, so an approval step can be added without changing the schema.
- **Customers:** one platform-wide account, plus a `customers` row per store. Guests get a `customers` row without a `user_id`, matched by email.

### Data model (core tables)

All money is stored as **integer centavos**, and `stores.currency` defaults to `PHP`. Every tenant table carries `store_id`.

| Table | Key columns / notes |
|-------|---------------------|
| `stores` | `slug` (unique, lowercase, checked against a reserved-words list), `name`, `tagline`, `status`, `currency`, `theme jsonb` (colors, font key), `branding jsonb` (logo/favicon/banner paths, about, announcement, contact, socials), `next_order_no` |
| `store_members` | PK `(store_id, user_id)`, `role` |
| `categories` | `name`, `slug`, `position` (for reordering) |
| `labels` | `text`, `color` (the label library) |
| `products` | `category_id`, `name`, `slug`, `description`, `price`, `sale_price` (nullable, must be lower than `price`), `stock`, `low_stock_threshold`, `is_visible`, `is_sold_out` (manual override) |
| `product_images` | `product_id`, `path`, `position`, `alt` |
| `product_labels` | PK `(product_id, label_id)` |
| `payment_methods` | `type` (`cod`/`gcash`/`bank_transfer`), `label`, `instructions`, `qr_path`, `enabled`, `position` |
| `shipping_options` | `name`, `fee`, `enabled`, `position` |
| `customers` | `user_id` (nullable), `email`, `phone`, `name`; unique `(store_id, email)` |
| `customer_addresses` | `user_id`, address fields (belong to the account and can be reused across stores) |
| `orders` | `order_no` (per store, e.g. `#1042`), `tracking_token` (random, 128-bit), `customer_id`, **snapshots:** `contact jsonb`, `shipping_address jsonb`, `payment_method jsonb`, `shipping_option jsonb`; `subtotal`, `shipping_fee`, `total`, `status` |
| `order_items` | `product_id` (nullable, `ON DELETE SET NULL`), **snapshots:** `product_name`, `image_path`, `unit_price`; `quantity`, `line_total` |
| `order_status_events` | `order_id`, `status`, `note`, `created_by`, `created_at`. Feeds the tracking timeline and the audit trail. |

Indexes go on `(store_id, created_at)` for orders, `(store_id, category_id, is_visible)` for products, and `(store_id, status)` for orders.

### RLS policy outline

- `is_store_member(store_id)` is a `SECURITY DEFINER STABLE` helper. Every seller policy uses it, which avoids policies on `store_members` calling themselves recursively.
- **Anonymous and public visitors (SELECT only):** active stores; visible products in active stores; their images, categories and labels; enabled payment methods and shipping options.
- **Store members:** full CRUD on catalog, branding and settings tables where `is_store_member(store_id)`. They can SELECT orders, order items and customers, but **cannot UPDATE `orders.status` directly**; status changes go through the RPC below.
- **Customers (signed in):** SELECT their own `orders` and `order_items` through `customers.user_id = auth.uid()`, and CRUD their own `customer_addresses`.
- **No one can INSERT orders directly.** Orders are only created by `place_order`.
- **Storage:** a public-read `store-assets` bucket with paths `{store_id}/…`. Write policies check `is_store_member` against the first folder in the path.
- The `service_role` key is used only by server-side code and never reaches the browser.

### Key flows

**Place order:** `place_order(store_slug, items[{product_id, qty}], contact, address, payment_method_id, shipping_option_id)` runs in a single transaction:
1. Loads the products and checks that each one is visible and not sold out.
2. Decrements stock with `UPDATE … SET stock = stock - qty WHERE stock >= qty`. If any row fails, the whole order fails with a "not enough stock" error that names the item.
3. Reads the **current** price (the sale price if set) from the database. Prices sent by the client are ignored.
4. Upserts the `customers` row.
5. Gets the next per-store order number with `UPDATE stores SET next_order_no = next_order_no + 1 … RETURNING`.
6. Inserts the order and its items with all snapshots, plus a `pending` status event.
7. Returns `order_no` and `tracking_token`. The confirmation page then redirects to `/store/[slug]/order/[token]`.

**Order tracking:** `get_order_by_token(token)` returns only the fields the customer needs: status timeline, items and totals. Because the token is unguessable, guests need no login. Signed-in customers also see their orders under "My account".

**Status update:** `update_order_status(order_id, new_status, note)` checks membership and allows only these transitions:
`pending → paid | cancelled`, `paid → shipped | cancelled`, `shipped → completed`.
Cancelling restores stock. Every change writes an `order_status_events` row, and the tracking page reads that history.

**Seller edits reach the storefront:** storefront reads use a cookieless Supabase client so they can be cached, tagged `store:{id}`. Every dashboard server action that changes catalog or branding data calls `revalidateTag('store:{id}')`. Checkout always re-checks prices and stock, so a briefly cached page can never charge the wrong price.

**Branding and theme:** the storefront layout turns `stores.theme` into CSS custom properties (`--brand-primary`, `--brand-accent`, …) that Tailwind tokens refer to. Fonts come from a **curated list** of about 10 Google Fonts. Text color on brand backgrounds is **computed for contrast** from the seller's colors, so a poor color choice can't make the store unreadable.

**Live preview:** the branding page embeds `/store/[slug]?preview=1` in an iframe; this route is uncached and only works for members. Unsaved form values are sent with `postMessage`, and the storefront's theme provider applies them straight away. The preview uses the real storefront components, so what the seller sees is what customers get.

**Cart:** stored in `localStorage` under the key `cart:{store_slug}`, holding only `{product_id, qty}`. Names, prices and stock are re-fetched whenever the cart is shown, and any item that is no longer available is flagged before checkout.

**Dashboard home:** an SQL function `store_sales_summary(store_id, tz='Asia/Manila')` returns today's and this month's sales, order counts, low-stock products and a daily series for the chart. Paid, shipped and completed orders count as sales. A Supabase Realtime subscription on `orders` filtered by `store_id` shows new orders as they arrive.

**Print/export:** a print stylesheet for the order details page, and a route handler that exports orders as CSV with the same filters as the list.

### Routing

| Path | Purpose |
|------|---------|
| `/`, `/signup`, `/login` | Marketing and auth |
| `/onboarding` | Create a store (name and slug) |
| `/dashboard/[storeSlug]/…` | `home`, `branding`, `products`, `categories`, `labels`, `orders`, `customers`, `settings` |
| `/store/[slug]` | Store home |
| `/store/[slug]/products`, `/p/[productSlug]`, `/cart`, `/checkout`, `/order/[token]`, `/account`, `/about`, `/contact` | Storefront |

**Folder layout.** Seller and customer code live in separate folders inside the single app. Folder names in parentheses are Next.js route groups, so they don't appear in URLs:

```
src/
  app/
    (seller)/      onboarding/, dashboard/[storeSlug]/…   private, store members only
    (customer)/    store/[slug]/…                        public storefront
  features/
    seller/        components/, actions/, queries/
    customer/      components/, actions/, queries/
    shared/        code both sides use (theme, money formatting, product card for live preview)
  lib/supabase/    Supabase clients
```

An ESLint `no-restricted-imports` rule stops seller code importing customer code and the reverse, so anything both sides need has to go through `features/shared`.

Storefront pages get their store from a resolved store context, never by parsing the URL themselves. This lets subdomains (`slug.artzwork…`) or custom domains be added later with a middleware rewrite, without touching the pages.

### Abuse and safety

- Add Cloudflare Turnstile to checkout, and rate-limit `place_order` per IP and per store, to stop fake orders from locking up stock.
- Unpaid `pending` orders are cancelled automatically after a period each store chooses (default 3 days) by a `pg_cron` job, which also returns their stock.
- Uploads are limited to images under 5 MB and served through Supabase image transforms.

## Consequences

- **Easier:** tenant isolation can be checked in one place, the policies. Adding staff accounts, a platform admin or subdomains needs no schema change. Old orders are never affected by later price changes. Reports are plain SQL.
- **Harder:** some logic lives in SQL functions, so they need migrations, versioning and tests. Developers must learn RLS. Cache invalidation must be called from every action that changes data; a shared `revalidateStore()` helper keeps this in one place.
- **To revisit:**
  - **Product variants** (size and color). They aren't in the brief, but adding them later changes stock, the cart and order items, so decide **before** building products.
  - **Proof of payment** upload for GCash and bank transfer, which would mean letting guests write to Storage.
  - **Payment gateway** (for example PayMongo for automatic GCash and card payments). The `payment_methods.type` field and the `paid` status already allow for it.
  - **Email or SMS notifications** for order placed and status changes (for example Resend).
  - Whether customer accounts are **platform-wide** (this ADR's choice) or separate per store.

## Action Items

1. [ ] Decide on product variants (yes or no for v1) before building the schema.
2. [ ] Scaffold the Next.js, TypeScript, Tailwind and Supabase project; set up the Supabase CLI with local dev and migrations in `supabase/migrations`.
3. [ ] Write the core schema, RLS policies and `is_store_member`. Add **pgTAP tests** that prove seller A cannot read or write seller B's rows and that anonymous visitors cannot insert orders.
4. [ ] Build the `place_order`, `update_order_status`, `get_order_by_token` and `store_sales_summary` RPCs, with tests for overselling, price tampering and invalid status changes.
5. [ ] Build the seller side in this order: auth and onboarding → products, categories and labels → branding with live preview → settings (payments, shipping) → orders → dashboard home → customers.
6. [ ] Build the storefront in this order: theme layout → home and listing → product page → cart → checkout → confirmation and tracking → account.
7. [ ] Add caching with `revalidateStore()`, Turnstile and rate limiting on checkout, and the `pg_cron` auto-cancel job.
8. [ ] Before launch, move to Supabase Pro (backups, no pausing) and Vercel Pro (commercial use).
