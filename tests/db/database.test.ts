import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createUser, rejects } from "./harness";

// Single-client mode: one store, created by the configured seller email.
const SELLER_EMAIL = "owner@example.com";

let db: PGlite;
let seller: string;
let other: string; // a signed-in customer, not a store member
let shopper: string;
let store: { id: string; slug: string };
let cod: string;
let ship: string;

async function createStore(userId: string, name: string, slug: string) {
  return as(db, userId, async (tx) => {
    const { rows } = await tx.query<{ id: string; slug: string }>(
      "select id, slug from public.create_store($1, $2)",
      [name, slug],
    );
    return rows[0];
  });
}

async function addProduct(
  p: { name: string; slug: string; price: number; sale_price?: number; stock: number; is_visible?: boolean },
) {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.products (store_id, name, slug, price, sale_price, stock, is_visible)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [store.id, p.name, p.slug, p.price, p.sale_price ?? null, p.stock, p.is_visible ?? true],
  );
  return rows[0].id;
}

async function stockOf(productId: string) {
  const { rows } = await db.query<{ stock: number }>("select stock from public.products where id = $1", [productId]);
  return rows[0].stock;
}

const contact = { name: "Juan Dela Cruz", email: "Juan@Example.com", phone: "09171234567" };
const address = { line1: "123 Rizal St", barangay: "Poblacion", city: "Makati", province: "Metro Manila" };

async function placeOrder(
  userId: string | null,
  items: { product_id: string; quantity: number }[],
  overrides: Partial<{ slug: string; contact: object; payment: string; shipping: string }> = {},
) {
  return as(db, userId, async (tx) => {
    const { rows } = await tx.query<{ order_no: number; tracking_token: string }>(
      "select * from public.place_order($1, $2, $3, $4, $5, $6)",
      [
        overrides.slug ?? store.slug,
        JSON.stringify(items),
        JSON.stringify(overrides.contact ?? contact),
        JSON.stringify(address),
        overrides.payment ?? cod,
        overrides.shipping ?? ship,
      ],
    );
    return rows[0];
  });
}

/** The checkout spam limits (private.config); tests raise them, and the hardening tests lower them. */
async function setOrderLimits(perContact: number, perHour: number) {
  await db.query("update private.config set value = $1 where key = 'max_pending_per_contact_per_hour'", [String(perContact)]);
  await db.query("update private.config set value = $1 where key = 'max_pending_per_hour'", [String(perHour)]);
}

beforeAll(async () => {
  db = await createDb();
  await setOrderLimits(1000, 1000); // these tests place many orders quickly
  seller = await createUser(db, SELLER_EMAIL);
  other = await createUser(db, "other@example.com");
  shopper = await createUser(db, "shopper@example.com");
  store = await createStore(seller, "Artz Prints", "artz-prints");
  const ids = async (table: string) =>
    (await db.query<{ id: string }>(`select id from public.${table} where store_id = $1`, [store.id])).rows[0].id;
  cod = await ids("payment_methods");
  ship = await ids("shipping_options");
  await db.query("update public.shipping_options set fee = 15000 where id = $1", [ship]);
}, 60_000);

describe("create_store (single-client mode)", () => {
  it("makes the seller owner and seeds labels, payment and shipping", async () => {
    const { rows } = await db.query<{ role: string; labels: number; pay: number; ship: number }>(
      `select m.role,
         (select count(*)::int from public.labels where store_id = $1) as labels,
         (select count(*)::int from public.payment_methods where store_id = $1) as pay,
         (select count(*)::int from public.shipping_options where store_id = $1) as ship
       from public.store_members m where m.store_id = $1 and m.user_id = $2`,
      [store.id, seller],
    );
    expect(rows[0]).toEqual({ role: "owner", labels: 3, pay: 1, ship: 1 });
  });

  it("only lets the seller email create a store, and only one", async () => {
    await rejects(createStore(other, "Copycat", "copycat"), "NOT_SELLER");
    await rejects(createStore(seller, "Second", "second-store"), "STORE_EXISTS");
    await rejects(
      as(db, null, (tx) => tx.query("select public.create_store('x', 'anon-store')")),
      "permission denied",
    );
    // Even bypassing the function, a second store can't exist.
    await rejects(
      db.query("insert into public.stores (name, slug, created_by) values ('B', 'b-store', $1)", [other]),
      "stores_single_store",
    );
  });

  it("does not treat an unconfirmed seller email as the seller", async () => {
    const fresh = await createDb();
    const unconfirmed = (await fresh.query<{ id: string }>(
      "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id",
      [SELLER_EMAIL],
    )).rows[0].id;
    await rejects(
      as(fresh, unconfirmed, (tx) => tx.query("select public.create_store('Artz', 'artz')")),
      "NOT_SELLER",
    );
  });

  it("reports who is the seller", async () => {
    const yes = await as(db, seller, (tx) => tx.query<{ v: boolean }>("select public.is_seller() as v"));
    const no = await as(db, other, (tx) => tx.query<{ v: boolean }>("select public.is_seller() as v"));
    expect([yes.rows[0].v, no.rows[0].v]).toEqual([true, false]);
  });

  it("rejects reserved and malformed slugs", async () => {
    await rejects(db.query("update public.stores set slug = 'dashboard' where id = $1", [store.id]), "check constraint");
    await rejects(db.query("update public.stores set slug = '-bad slug-' where id = $1", [store.id]), "check constraint");
  });

  it("keeps the seller config out of the API", async () => {
    await rejects(as(db, other, (tx) => tx.query("select * from private.config")), "permission denied");
  });
});

describe("access control", () => {
  let hidden: string;

  beforeAll(async () => {
    hidden = await addProduct({ name: "Draft", slug: "draft", price: 100, stock: 1, is_visible: false });
  });

  it("hides unpublished products from everyone but the seller", async () => {
    const own = await as(db, seller, (tx) => tx.query("select id from public.products where id = $1", [hidden]));
    const customer = await as(db, other, (tx) => tx.query("select id from public.products where id = $1", [hidden]));
    const anon = await as(db, null, (tx) => tx.query("select id from public.products where id = $1", [hidden]));
    expect(own.rows).toHaveLength(1);
    expect(customer.rows).toHaveLength(0);
    expect(anon.rows).toHaveLength(0);
  });

  it("stops non-members writing to the store", async () => {
    const updated = await as(db, other, (tx) =>
      tx.query("update public.products set price = 1 where store_id = $1", [store.id]),
    );
    expect(updated.affectedRows).toBe(0);
    await rejects(
      as(db, other, (tx) =>
        tx.query("insert into public.products (store_id, name, slug, price) values ($1, 'X', 'x', 1)", [store.id]),
      ),
      "row-level security",
    );
    const renamed = await as(db, other, (tx) =>
      tx.query("update public.stores set name = 'Hacked' where id = $1", [store.id]),
    );
    expect(renamed.affectedRows).toBe(0);
  });

  it("lets the seller edit branding but not protected store columns", async () => {
    const ok = await as(db, seller, (tx) =>
      tx.query("update public.stores set tagline = 'Hand-made prints' where id = $1", [store.id]),
    );
    expect(ok.affectedRows).toBe(1);
    await rejects(
      as(db, seller, (tx) => tx.query("update public.stores set next_order_no = 1 where id = $1", [store.id])),
      "permission denied",
    );
    await rejects(
      as(db, seller, (tx) => tx.query("update public.stores set status = 'active' where id = $1", [store.id])),
      "permission denied",
    );
  });

  it("gives the public no direct access to orders or customers", async () => {
    await rejects(as(db, null, (tx) => tx.query("select * from public.orders")), "permission denied");
    await rejects(as(db, null, (tx) => tx.query("select * from public.customers")), "permission denied");
    await rejects(
      as(db, seller, (tx) => tx.query("update public.orders set status = 'paid' where store_id = $1", [store.id])),
      "permission denied",
    );
  });
});

describe("place_order", () => {
  let mug: string;
  let tote: string;
  let hidden: string;

  beforeAll(async () => {
    mug = await addProduct({ name: "Mug", slug: "mug", price: 50000, sale_price: 40000, stock: 5 });
    tote = await addProduct({ name: "Tote", slug: "tote", price: 30000, stock: 1 });
    hidden = await addProduct({ name: "Secret", slug: "secret", price: 100, stock: 9, is_visible: false });
  });

  it("prices from the database, snapshots the order and reserves stock", async () => {
    const placed = await placeOrder(null, [
      { product_id: mug, quantity: 2 },
      { product_id: tote, quantity: 1 },
    ]);
    expect(placed.order_no).toBe(1001);
    expect(placed.tracking_token).toMatch(/^[0-9a-f]{64}$/);

    const { rows } = await db.query<{ subtotal: number; shipping_fee: number; total: number; email: string }>(
      "select subtotal, shipping_fee, total, contact->>'email' as email from public.orders where tracking_token = $1",
      [placed.tracking_token],
    );
    // 2 x 400.00 sale price + 300.00 + 150.00 shipping
    expect(rows[0]).toEqual({ subtotal: 110000, shipping_fee: 15000, total: 125000, email: "juan@example.com" });
    expect(await stockOf(mug)).toBe(3);
    expect(await stockOf(tote)).toBe(0);

    // Later price changes do not touch the order.
    await db.query("update public.products set price = 99900, sale_price = null where id = $1", [mug]);
    const items = await db.query<{ unit_price: number }>(
      "select unit_price from public.order_items where product_id = $1",
      [mug],
    );
    expect(items.rows[0].unit_price).toBe(40000);

    const next = await placeOrder(null, [{ product_id: mug, quantity: 1 }]);
    expect(next.order_no).toBe(1002);
  });

  it("is all-or-nothing when any item is short", async () => {
    const before = await stockOf(mug);
    await rejects(
      placeOrder(null, [
        { product_id: mug, quantity: 1 },
        { product_id: tote, quantity: 1 },
      ]),
      "OUT_OF_STOCK",
    );
    expect(await stockOf(mug)).toBe(before);
  });

  it("rejects bad input and hidden products", async () => {
    await rejects(placeOrder(null, []), "CART_EMPTY");
    await rejects(placeOrder(null, [{ product_id: mug, quantity: 0 }]), "QUANTITY_INVALID");
    await rejects(
      placeOrder(null, [{ product_id: mug, quantity: 1 }], { contact: { ...contact, email: "nope" } }),
      "CONTACT_INVALID",
    );
    await rejects(placeOrder(null, [{ product_id: hidden, quantity: 1 }]), "PRODUCT_UNAVAILABLE");
    await rejects(placeOrder(null, [{ product_id: mug, quantity: 1 }], { slug: "no-such-store" }), "STORE_NOT_FOUND");
    await db.query("update public.shipping_options set enabled = false where id = $1", [ship]);
    await rejects(placeOrder(null, [{ product_id: mug, quantity: 1 }]), "SHIPPING_OPTION_INVALID");
    await db.query("update public.shipping_options set enabled = true where id = $1", [ship]);
    await db.query("update public.payment_methods set enabled = false where id = $1", [cod]);
    await rejects(placeOrder(null, [{ product_id: mug, quantity: 1 }]), "PAYMENT_METHOD_INVALID");
    await db.query("update public.payment_methods set enabled = true where id = $1", [cod]);
  });

  it("never links a signed-in shopper to someone else's customer record", async () => {
    // A guest ordered as victim@example.com; the shopper is signed in but types the victim's email.
    await placeOrder(null, [{ product_id: mug, quantity: 1 }], { contact: { ...contact, email: "victim@example.com" } });
    await placeOrder(shopper, [{ product_id: mug, quantity: 1 }], { contact: { ...contact, email: "victim@example.com" } });

    const seen = await as(db, shopper, (tx) =>
      tx.query<{ email: string }>("select contact->>'email' as email from public.orders"),
    );
    expect(seen.rows.map((r) => r.email)).toEqual(["shopper@example.com"]);
  });
});

describe("order status and tracking", () => {
  let poster: string;
  let token: string;
  let orderId: string;

  beforeAll(async () => {
    poster = await addProduct({ name: "Poster", slug: "poster", price: 20000, stock: 10 });
    token = (await placeOrder(null, [{ product_id: poster, quantity: 3 }])).tracking_token;
    orderId = (await db.query<{ id: string }>("select id from public.orders where tracking_token = $1", [token]))
      .rows[0].id;
  });

  const setStatus = (userId: string, status: string) =>
    as(db, userId, (tx) => tx.query("select public.update_order_status($1, $2)", [orderId, status]));

  it("only lets the seller change status, along allowed steps", async () => {
    await rejects(setStatus(other, "paid"), "ORDER_NOT_FOUND");
    await rejects(setStatus(seller, "shipped"), "INVALID_STATUS_TRANSITION");
    await setStatus(seller, "paid");
    await rejects(setStatus(seller, "pending"), "INVALID_STATUS_TRANSITION");
  });

  it("shows guests their order by token and nothing for a wrong token", async () => {
    const found = await as(db, null, (tx) =>
      tx.query<{ o: { order_no: number; status: string; events: { status: string }[] } }>(
        "select public.get_order_by_token($1) as o",
        [token],
      ),
    );
    expect(found.rows[0].o.status).toBe("paid");
    expect(found.rows[0].o.events.map((e) => e.status)).toEqual(["pending", "paid"]);

    const missing = await as(db, null, (tx) =>
      tx.query<{ o: unknown }>("select public.get_order_by_token($1) as o", ["0".repeat(64)]),
    );
    expect(missing.rows[0].o).toBeNull();
  });

  it("returns stock when an order is cancelled", async () => {
    expect(await stockOf(poster)).toBe(7);
    await setStatus(seller, "cancelled");
    expect(await stockOf(poster)).toBe(10);
  });
});

describe("housekeeping and dashboard", () => {
  it("auto-cancels stale pending orders and restores their stock", async () => {
    const frame = await addProduct({ name: "Frame", slug: "frame", price: 10000, stock: 4 });
    const { tracking_token } = await placeOrder(null, [{ product_id: frame, quantity: 2 }]);
    await db.query("update public.orders set created_at = now() - interval '4 days' where tracking_token = $1", [
      tracking_token,
    ]);

    await db.query("select private.cancel_stale_pending_orders()");

    const { rows } = await db.query<{ status: string }>("select status from public.orders where tracking_token = $1", [
      tracking_token,
    ]);
    expect(rows[0].status).toBe("cancelled");
    expect(await stockOf(frame)).toBe(4);
  });

  it("summarises sales for the seller only", async () => {
    const summary = await as(db, seller, (tx) =>
      tx.query<{ s: { today_orders: number; daily: unknown[]; low_stock: { name: string }[] } }>(
        "select public.store_sales_summary($1) as s",
        [store.id],
      ),
    );
    const s = summary.rows[0].s;
    expect(s.today_orders).toBeGreaterThan(0);
    expect(s.daily).toHaveLength(30);
    expect(s.low_stock.map((p) => p.name)).toContain("Tote");
    await rejects(
      as(db, other, (tx) => tx.query("select public.store_sales_summary($1)", [store.id])),
      "STORE_NOT_FOUND",
    );
  });

  it("links guest orders to an account only after its email is verified", async () => {
    const unverified = await createUser(db, "juan@example.com", false);
    const none = await as(db, unverified, (tx) => tx.query<{ n: number }>("select public.claim_customer_records() as n"));
    expect(none.rows[0].n).toBe(0);

    await db.query("update auth.users set email_confirmed_at = now() where id = $1", [unverified]);
    const claimed = await as(db, unverified, (tx) => tx.query<{ n: number }>("select public.claim_customer_records() as n"));
    expect(claimed.rows[0].n).toBe(1);
  });
});

describe("pen-test hardening", () => {
  let gadget: string;

  beforeAll(async () => {
    gadget = await addProduct({ name: "Gadget", slug: "gadget", price: 5000, stock: 50 });
  });

  it("limits unpaid orders per contact, and rolls back the stock of a refused one", async () => {
    await setOrderLimits(2, 1000);
    const spammer = { ...contact, email: "spam@example.com", phone: "09179990000" };
    await placeOrder(null, [{ product_id: gadget, quantity: 1 }], { contact: spammer });
    await placeOrder(null, [{ product_id: gadget, quantity: 1 }], { contact: { ...spammer, email: "other@example.com" } }); // same phone
    const before = await stockOf(gadget);
    await rejects(placeOrder(null, [{ product_id: gadget, quantity: 5 }], { contact: spammer }), "TOO_MANY_ORDERS");
    expect(await stockOf(gadget)).toBe(before);
    // A different customer can still order.
    await placeOrder(null, [{ product_id: gadget, quantity: 1 }], { contact: { ...contact, email: "real@example.com", phone: "09171112222" } });
    await setOrderLimits(1000, 1000);
  });

  it("limits unpaid orders for the whole shop per hour", async () => {
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from public.orders where status = 'pending' and created_at >= now() - interval '1 hour'",
    );
    await setOrderLimits(1000, rows[0].n);
    await rejects(
      placeOrder(null, [{ product_id: gadget, quantity: 1 }], { contact: { ...contact, email: "new@example.com", phone: "09173334444" } }),
      "SHOP_BUSY",
    );
    await setOrderLimits(1000, 1000);
  });

  it("hides the order counter and owner id from visitors and customers", async () => {
    await rejects(as(db, null, (tx) => tx.query("select next_order_no from public.stores")), "permission denied");
    await rejects(as(db, other, (tx) => tx.query("select created_by from public.stores")), "permission denied");
    const shown = await as(db, null, (tx) => tx.query<{ name: string }>("select name, slug, branding from public.stores"));
    expect(shown.rows[0].name).toBe("Artz Prints");
  });

  it("keeps saved addresses private to their owner", async () => {
    const address = { recipient: "Juan", phone: "09171234567", line1: "1 Secret St", city: "Makati", province: "Metro Manila" };
    await as(db, shopper, (tx) =>
      tx.query(
        "insert into public.customer_addresses (recipient, phone, line1, city, province) values ($1, $2, $3, $4, $5)",
        Object.values(address),
      ),
    );
    const own = await as(db, shopper, (tx) => tx.query("select id from public.customer_addresses"));
    expect(own.rows).toHaveLength(1);

    const theirs = await as(db, other, (tx) => tx.query("select id from public.customer_addresses"));
    expect(theirs.rows).toHaveLength(0);
    const changed = await as(db, other, (tx) => tx.query("update public.customer_addresses set line1 = 'hacked'"));
    expect(changed.affectedRows).toBe(0);
    const removed = await as(db, other, (tx) => tx.query("delete from public.customer_addresses"));
    expect(removed.affectedRows).toBe(0);
    await rejects(
      as(db, other, (tx) =>
        tx.query(
          "insert into public.customer_addresses (user_id, recipient, phone, line1, city, province) values ($1, 'x', '09170000000', 'x', 'x', 'x')",
          [shopper],
        ),
      ),
      "row-level security",
    );
    await rejects(as(db, null, (tx) => tx.query("select * from public.customer_addresses")), "permission denied");
  });
});

describe("delete my account", () => {
  it("deletes a customer's login and addresses but keeps their orders", async () => {
    const leaving = await createUser(db, "leaving@example.com");
    const item = await addProduct({ name: "Keepsake", slug: "keepsake", price: 1000, stock: 5 });
    await placeOrder(leaving, [{ product_id: item, quantity: 1 }], { contact: { ...contact, email: "leaving@example.com" } });
    await as(db, leaving, (tx) =>
      tx.query("insert into public.customer_addresses (recipient, phone, line1, city, province) values ('L', '09170000000', '1 St', 'Makati', 'MM')"),
    );

    await as(db, leaving, (tx) => tx.query("select public.delete_my_account()"));

    const user = await db.query("select id from auth.users where id = $1", [leaving]);
    const addresses = await db.query("select id from public.customer_addresses where user_id = $1", [leaving]);
    const orders = await db.query<{ n: number }>("select count(*)::int as n from public.orders where contact->>'email' = 'leaving@example.com'");
    const link = await db.query<{ user_id: string | null }>("select user_id from public.customers where email = 'leaving@example.com'");
    expect(user.rows).toHaveLength(0);
    expect(addresses.rows).toHaveLength(0);
    expect(orders.rows[0].n).toBe(1);
    expect(link.rows[0].user_id).toBeNull();
  });

  it("refuses the shop owner's account and visitors who aren't logged in", async () => {
    await rejects(as(db, seller, (tx) => tx.query("select public.delete_my_account()")), "OWNER_ACCOUNT");
    await rejects(as(db, null, (tx) => tx.query("select public.delete_my_account()")), "permission denied");
    expect((await db.query("select id from auth.users where id = $1", [seller])).rows).toHaveLength(1);
  });
});

describe("customer cancels their order", () => {
  const cancel = (token: string) => as(db, null, (tx) => tx.query("select public.cancel_order_by_token($1)", [token]));
  const orderOf = async (token: string) =>
    (await db.query<{ id: string; status: string }>("select id, status from public.orders where tracking_token = $1", [token])).rows[0];

  it("cancels a placed or paid order with its link and puts the stock back", async () => {
    const lamp = await addProduct({ name: "Lamp", slug: "lamp", price: 5000, stock: 4 });
    const placed = (await placeOrder(null, [{ product_id: lamp, quantity: 2 }], { contact: { ...contact, email: "c1@example.com" } })).tracking_token;
    const paid = (await placeOrder(null, [{ product_id: lamp, quantity: 1 }], { contact: { ...contact, email: "c2@example.com" } })).tracking_token;
    const paidId = (await orderOf(paid)).id;
    await as(db, seller, (tx) => tx.query("select public.update_order_status($1, 'paid')", [paidId]));
    expect(await stockOf(lamp)).toBe(1);

    await cancel(placed);
    await cancel(paid);

    expect((await orderOf(placed)).status).toBe("cancelled");
    expect((await orderOf(paid)).status).toBe("cancelled");
    expect(await stockOf(lamp)).toBe(4);
    const note = await db.query<{ note: string }>(
      "select note from public.order_status_events where order_id = $1 and status = 'cancelled'",
      [(await orderOf(placed)).id],
    );
    expect(note.rows[0].note).toBe("Cancelled by the customer");
  });

  it("refuses once the order has shipped, a second cancel, and a wrong link", async () => {
    const desk = await addProduct({ name: "Desk", slug: "desk", price: 9000, stock: 3 });
    const token = (await placeOrder(null, [{ product_id: desk, quantity: 1 }], { contact: { ...contact, email: "c3@example.com" } })).tracking_token;
    const { id } = await orderOf(token);
    await as(db, seller, (tx) => tx.query("select public.update_order_status($1, 'paid')", [id]));
    await as(db, seller, (tx) => tx.query("select public.update_order_status($1, 'shipped')", [id]));

    await rejects(cancel(token), "CANNOT_CANCEL");
    expect((await orderOf(token)).status).toBe("shipped");
    expect(await stockOf(desk)).toBe(2);

    await rejects(cancel("0".repeat(64)), "ORDER_NOT_FOUND");
    await rejects(cancel("short"), "ORDER_NOT_FOUND");
  });

  it("does not cancel twice", async () => {
    const cup = await addProduct({ name: "Cup", slug: "cancel-cup", price: 500, stock: 5 });
    const token = (await placeOrder(null, [{ product_id: cup, quantity: 1 }], { contact: { ...contact, email: "c4@example.com" } })).tracking_token;
    await cancel(token);
    await rejects(cancel(token), "CANNOT_CANCEL");
    expect(await stockOf(cup)).toBe(5);
  });
});

describe("courier tracking, pickup and unseen updates", () => {
  const orderBy = async (token: string) =>
    (await db.query<{ id: string }>("select id from public.orders where tracking_token = $1", [token])).rows[0].id;
  const view = async (token: string) =>
    (await as(db, null, (tx) => tx.query<{ o: Record<string, unknown> }>("select public.get_order_by_token($1) as o", [token]))).rows[0].o;
  const unseen = async (userId: string) =>
    (await as(db, userId, (tx) => tx.query<{ n: number }>("select public.my_unseen_order_count() as n"))).rows[0].n;

  it("ships with courier details, only by the seller and only once paid", async () => {
    const ssd = await addProduct({ name: "SSD", slug: "track-ssd", price: 3000, stock: 5 });
    const token = (await placeOrder(null, [{ product_id: ssd, quantity: 1 }], { contact: { ...contact, email: "t1@example.com" } })).tracking_token;
    const id = await orderBy(token);
    const shipIt = (userId: string, url = "https://www.jtexpress.ph/trajectoryQuery?bills=123") =>
      as(db, userId, (tx) => tx.query("select public.ship_order($1, 'J&T Express', '123', $2)", [id, url]));

    await rejects(shipIt(other), "ORDER_NOT_FOUND");
    await rejects(shipIt(seller), "INVALID_STATUS_TRANSITION"); // still pending
    await as(db, seller, (tx) => tx.query("select public.update_order_status($1, 'paid')", [id]));
    await rejects(shipIt(seller, "javascript:alert(1)"), "TRACKING_URL_INVALID");
    await shipIt(seller);

    const o = await view(token);
    expect(o.status).toBe("shipped");
    expect([o.courier, o.tracking_no, o.tracking_url]).toEqual(["J&T Express", "123", "https://www.jtexpress.ph/trajectoryQuery?bills=123"]);
  });

  it("remembers that an order was for store pickup", async () => {
    const pickup = (
      await db.query<{ id: string }>(
        "insert into public.shipping_options (store_id, name, fee, kind) values ($1, 'Store pickup', 0, 'pickup') returning id",
        [store.id],
      )
    ).rows[0].id;
    const ram = await addProduct({ name: "RAM", slug: "pickup-ram", price: 2000, stock: 5 });
    const token = (await placeOrder(null, [{ product_id: ram, quantity: 1 }], { shipping: pickup, contact: { ...contact, email: "t2@example.com" } }))
      .tracking_token;
    expect((await view(token)).shipping_option).toMatchObject({ name: "Store pickup", kind: "pickup" });
    await rejects(db.query("update public.shipping_options set kind = 'drone' where id = $1", [pickup]), "check");
  });

  it("counts a customer's orders with news until they open them", async () => {
    const buyer = await createUser(db, "news@example.com");
    const fan = await addProduct({ name: "Fan", slug: "news-fan", price: 500, stock: 5 });
    const token = (await placeOrder(buyer, [{ product_id: fan, quantity: 1 }], { contact: { ...contact, email: "news@example.com" } })).tracking_token;
    expect(await unseen(buyer)).toBe(0); // placing it is not news

    // Status times come from now(), which is fixed inside a transaction: move the placement back.
    await db.query("update public.orders set created_at = created_at - interval '1 minute', status_changed_at = status_changed_at - interval '1 minute' where tracking_token = $1", [token]);
    await as(db, seller, async (tx) => tx.query("select public.update_order_status(id, 'paid') from public.orders where tracking_token = $1", [token]));
    expect(await unseen(buyer)).toBe(1);
    expect(await unseen(seller)).toBe(0); // the seller's login sees every order, but has none of its own

    const first = await as(db, null, (tx) => tx.query<{ b: boolean }>("select public.mark_order_seen($1) as b", [token]));
    expect(first.rows[0].b).toBe(true);
    expect(await unseen(buyer)).toBe(0);
    const again = await as(db, null, (tx) => tx.query<{ b: boolean }>("select public.mark_order_seen($1) as b", [token]));
    expect(again.rows[0].b).toBe(false);
    await rejects(as(db, null, (tx) => tx.query("select public.my_unseen_order_count()")), "permission denied");
  });
});

describe("payment reference from the customer", () => {
  const send = (token: string, ref: string) => as(db, null, (tx) => tx.query("select public.submit_payment_ref($1, $2)", [token, ref]));
  const refOf = async (token: string) =>
    (await db.query<{ payment_ref: string | null }>("select payment_ref from public.orders where tracking_token = $1", [token])).rows[0].payment_ref;
  let gcash: string;
  beforeAll(async () => {
    gcash = (
      await db.query<{ id: string }>(
        "insert into public.payment_methods (store_id, type, label, account_name, account_number) values ($1, 'gcash', 'GCash', 'Shop', '09170000000') returning id",
        [store.id],
      )
    ).rows[0].id;
  });

  it("saves a tidy reference for a pending GCash order, and lets it be corrected", async () => {
    const item = await addProduct({ name: "Cable", slug: "ref-cable", price: 300, stock: 5 });
    const token = (await placeOrder(null, [{ product_id: item, quantity: 1 }], { payment: gcash, contact: { ...contact, email: "r1@example.com" } })).tracking_token;
    await send(token, "  1012  3456 789 ");
    expect(await refOf(token)).toBe("1012 3456 789");
    await send(token, "abc-12345");
    expect(await refOf(token)).toBe("ABC-12345");
    const view = await as(db, null, (tx) => tx.query<{ o: { payment_ref: string } }>("select public.get_order_by_token($1) as o", [token]));
    expect(view.rows[0].o.payment_ref).toBe("ABC-12345");
  });

  it("refuses junk, cash on delivery, paid orders and wrong links", async () => {
    const item = await addProduct({ name: "Plug", slug: "ref-plug", price: 300, stock: 5 });
    const token = (await placeOrder(null, [{ product_id: item, quantity: 1 }], { payment: gcash, contact: { ...contact, email: "r2@example.com" } })).tracking_token;
    await rejects(send(token, "x"), "PAYMENT_REF_INVALID");
    await rejects(send(token, "<script>"), "PAYMENT_REF_INVALID");
    await rejects(send(token, "1".repeat(41)), "PAYMENT_REF_INVALID");
    await rejects(send("0".repeat(64), "12345"), "ORDER_NOT_FOUND");

    const codToken = (await placeOrder(null, [{ product_id: item, quantity: 1 }], { contact: { ...contact, email: "r3@example.com" } })).tracking_token;
    await rejects(send(codToken, "12345"), "PAYMENT_REF_NOT_NEEDED");

    await as(db, seller, (tx) => tx.query("select public.update_order_status(id, 'paid') from public.orders where tracking_token = $1", [token]));
    await rejects(send(token, "12345"), "PAYMENT_REF_NOT_NEEDED");
  });
});

describe("online payments (GCash / online banking through a provider)", () => {
  const SECRET = "s".repeat(40);
  let online: string;
  let manual: string;
  beforeAll(async () => {
    await db.query("insert into private.config (key, value) values ('payment_confirm_secret', $1) on conflict (key) do update set value = excluded.value", [SECRET]);
    online = (
      await db.query<{ id: string }>("insert into public.payment_methods (store_id, type, label, online) values ($1, 'gcash', 'GCash online', true) returning id", [store.id])
    ).rows[0].id;
    manual = (await db.query<{ id: string }>("insert into public.payment_methods (store_id, type, label) values ($1, 'bank_transfer', 'BDO') returning id", [store.id])).rows[0].id;
  });
  const call = <T,>(sql: string, params: unknown[]) => as(db, null, (tx) => tx.query<T & Record<string, unknown>>(sql, params));
  const attach = (secret: string, token: string, session: string) => call("select public.attach_payment_session($1, $2, $3) as r", [secret, token, session]);
  const confirm = (secret: string, session: string, amount: number, ref = "GC-123") =>
    call<{ t: string }>("select public.confirm_online_payment($1, $2, $3, $4) as t", [secret, session, amount, ref]);
  const row = async (token: string) =>
    (await db.query<{ status: string; total: number; payment_ref: string | null; online: string }>(
      "select status, total, payment_ref, payment_method->>'online' as online from public.orders where tracking_token = $1",
      [token],
    )).rows[0];

  it("snapshots whether the method is online", async () => {
    const item = await addProduct({ name: "Mouse", slug: "online-mouse", price: 1500, stock: 9 });
    const a = (await placeOrder(null, [{ product_id: item, quantity: 1 }], { payment: online, contact: { ...contact, email: "o1@example.com" } })).tracking_token;
    const b = (await placeOrder(null, [{ product_id: item, quantity: 1 }], { payment: manual, contact: { ...contact, email: "o2@example.com" } })).tracking_token;
    expect((await row(a)).online).toBe("true");
    expect((await row(b)).online).toBe("false");
    await rejects(db.query("update public.payment_methods set online = true where id = $1", [cod]), "payment_methods_online_not_cod");
  });

  it("marks the order paid once the provider confirms the full amount, and only once", async () => {
    const item = await addProduct({ name: "Keyboard", slug: "online-keyboard", price: 2500, stock: 9 });
    const token = (await placeOrder(null, [{ product_id: item, quantity: 2 }], { payment: online, contact: { ...contact, email: "o3@example.com" } })).tracking_token;
    const { total } = await row(token);
    await attach(SECRET, token, "cs_test_1");
    await rejects(confirm(SECRET, "cs_test_1", total - 1), "AMOUNT_MISMATCH");
    expect((await row(token)).status).toBe("pending");

    const res = await confirm(SECRET, "cs_test_1", total);
    expect(res.rows[0].t).toBe(token);
    const paid = await row(token);
    expect([paid.status, paid.payment_ref]).toEqual(["paid", "GC-123"]);
    const events = await db.query<{ n: number }>(
      "select count(*)::int as n from public.order_status_events e join public.orders o on o.id = e.order_id where o.tracking_token = $1 and e.status = 'paid'",
      [token],
    );
    await confirm(SECRET, "cs_test_1", total); // the webhook and the return page may both confirm
    const again = await db.query<{ n: number }>(
      "select count(*)::int as n from public.order_status_events e join public.orders o on o.id = e.order_id where o.tracking_token = $1 and e.status = 'paid'",
      [token],
    );
    expect([events.rows[0].n, again.rows[0].n]).toEqual([1, 1]);
  });

  it("refuses anyone without the server's secret, unknown sessions, and manual or paid orders", async () => {
    const item = await addProduct({ name: "Headset", slug: "online-headset", price: 3000, stock: 9 });
    const token = (await placeOrder(null, [{ product_id: item, quantity: 1 }], { payment: online, contact: { ...contact, email: "o4@example.com" } })).tracking_token;
    const { total } = await row(token);
    await rejects(attach("wrong", token, "cs_x"), "NOT_ALLOWED");
    await rejects(attach("", token, "cs_x"), "NOT_ALLOWED");
    await attach(SECRET, token, "cs_test_2");
    await rejects(confirm("wrong", "cs_test_2", total), "NOT_ALLOWED");
    await rejects(confirm(SECRET, "cs_nope", total), "ORDER_NOT_FOUND");
    expect((await row(token)).status).toBe("pending");

    const manualToken = (await placeOrder(null, [{ product_id: item, quantity: 1 }], { payment: manual, contact: { ...contact, email: "o5@example.com" } })).tracking_token;
    await rejects(attach(SECRET, manualToken, "cs_test_3"), "PAYMENT_NOT_NEEDED");
    // Online orders don't take a typed reference; manual ones still do.
    await rejects(as(db, null, (tx) => tx.query("select public.submit_payment_ref($1, '12345')", [token])), "PAYMENT_REF_NOT_NEEDED");
    await as(db, null, (tx) => tx.query("select public.submit_payment_ref($1, '12345')", [manualToken]));
  });

  it("can't be used when the secret isn't set up", async () => {
    await db.query("delete from private.config where key = 'payment_confirm_secret'");
    const item = await addProduct({ name: "Pad", slug: "online-pad", price: 900, stock: 9 });
    const token = (await placeOrder(null, [{ product_id: item, quantity: 1 }], { payment: online, contact: { ...contact, email: "o6@example.com" } })).tracking_token;
    await rejects(attach("", token, "cs_test_4"), "NOT_ALLOWED");
    await rejects(attach(SECRET, token, "cs_test_4"), "NOT_ALLOWED");
  });
});

describe("automatic payment check from the shop's SMS", () => {
  const SECRET = "m".repeat(40);
  let gcashManual: string;
  beforeAll(async () => {
    await db.query("insert into private.config (key, value) values ('payment_confirm_secret', $1) on conflict (key) do update set value = excluded.value", [SECRET]);
    gcashManual = (
      await db.query<{ id: string }>("insert into public.payment_methods (store_id, type, label, account_name, account_number) values ($1, 'gcash', 'GCash QR', 'Shop', '09170000000') returning id", [store.id])
    ).rows[0].id;
  });
  const orderOf = async (token: string) =>
    (await db.query<{ status: string; total: number; pay_amount: number; payment_ref: string | null }>(
      "select status, total, pay_amount, payment_ref from public.orders where tracking_token = $1",
      [token],
    )).rows[0];
  const sms = (amount: number | null, ref: string | null, dry = false, secret = SECRET) =>
    as(db, null, (tx) =>
      tx.query<{ r: { result: string; order_no: number | null; tracking_token: string | null } }>(
        "select public.match_payment_sms($1, $2, $3, 'GCash', 'You have received PHP ...', $4) as r",
        [secret, amount, ref, dry],
      ),
    ).then((res) => res.rows[0].r);

  it("gives each unpaid manual order a unique amount (total + 1-99 centavos); COD pays the total", async () => {
    const item = await addProduct({ name: "SSD 1TB", slug: "match-ssd", price: 300000, stock: 50 });
    const amounts = new Set<number>();
    for (let i = 0; i < 6; i++) {
      const t = (await placeOrder(null, [{ product_id: item, quantity: 1 }], { payment: gcashManual, contact: { ...contact, email: `m${i}@example.com` } })).tracking_token;
      const o = await orderOf(t);
      expect(o.pay_amount - o.total).toBeGreaterThanOrEqual(1);
      expect(o.pay_amount - o.total).toBeLessThanOrEqual(99);
      amounts.add(o.pay_amount);
    }
    expect(amounts.size).toBe(6);
    const codToken = (await placeOrder(null, [{ product_id: item, quantity: 1 }], { contact: { ...contact, email: "m-cod@example.com" } })).tracking_token;
    const cod = await orderOf(codToken);
    expect(cod.pay_amount).toBe(cod.total);
  });

  it("marks the one order with that exact amount paid, logs the SMS, and ignores a repeat", async () => {
    const item = await addProduct({ name: "GPU", slug: "match-gpu", price: 1836000, stock: 5 });
    const token = (await placeOrder(null, [{ product_id: item, quantity: 1 }], { payment: gcashManual, contact: { ...contact, email: "m7@example.com" } })).tracking_token;
    const { pay_amount } = await orderOf(token);

    const dry = await sms(pay_amount, "1012 345 678901", true);
    expect(dry.result).toBe("matched");
    expect((await orderOf(token)).status).toBe("pending"); // a dry run changes nothing

    const r = await sms(pay_amount, "1012 345 678901");
    expect(r).toMatchObject({ result: "matched", tracking_token: token });
    const o = await orderOf(token);
    expect([o.status, o.payment_ref]).toEqual(["paid", "1012 345 678901"]);
    const note = await db.query<{ note: string }>(
      "select e.note from public.order_status_events e join public.orders o on o.id = e.order_id where o.tracking_token = $1 and e.status = 'paid'",
      [token],
    );
    expect(note.rows[0].note).toBe("Paid: matched automatically from the payment SMS (ref 1012 345 678901)");

    expect((await sms(pay_amount, "1012 345 678901")).result).toBe("already_paid");
    const log = await db.query<{ result: string }>("select result from public.payment_sms order by received_at");
    expect(log.rows.map((x) => x.result).slice(-2)).toEqual(["matched", "already_paid"]);
  });

  it("doesn't guess: wrong amounts and the plain total are left for the seller", async () => {
    const item = await addProduct({ name: "PSU", slug: "match-psu", price: 250000, stock: 5 });
    const token = (await placeOrder(null, [{ product_id: item, quantity: 1 }], { payment: gcashManual, contact: { ...contact, email: "m8@example.com" } })).tracking_token;
    const o = await orderOf(token);
    expect((await sms(o.total, null)).result).toBe("no_match"); // paid without the centavos
    expect((await sms(o.pay_amount + 100, null)).result).toBe("no_match");
    expect((await sms(null, null)).result).toBe("not_payment");
    expect((await orderOf(token)).status).toBe("pending");
  });

  it("only this server can report SMS, and visitors can't read the log", async () => {
    await rejects(sms(1000, null, false, "wrong"), "NOT_ALLOWED");
    const visible = await as(db, other, (tx) => tx.query("select * from public.payment_sms"));
    expect(visible.rows).toHaveLength(0);
    const seller = await as(db, (await db.query<{ user_id: string }>("select user_id from public.store_members limit 1")).rows[0].user_id, (tx) =>
      tx.query("select * from public.payment_sms"),
    );
    expect(seller.rows.length).toBeGreaterThan(0);
  });
});

describe("automatic payment check never touches orders without unique centavos", () => {
  const SECRET = "u".repeat(40);
  it("an unpaid order that pays its plain total is left for the seller", async () => {
    await db.query("insert into private.config (key, value) values ('payment_confirm_secret', $1) on conflict (key) do update set value = excluded.value", [SECRET]);
    const item = await addProduct({ name: "Cable Pack", slug: "plain-cable", price: 22200, stock: 5 });
    // Cash on delivery: its amount to pay is the plain total.
    const token = (await placeOrder(null, [{ product_id: item, quantity: 1 }], { contact: { ...contact, email: "plain@example.com" } })).tracking_token;
    const { rows } = await db.query<{ total: number; pay_amount: number }>("select total, pay_amount from public.orders where tracking_token = $1", [token]);
    expect(rows[0].pay_amount).toBe(rows[0].total);
    const r = await as(db, null, (tx) =>
      tx.query<{ r: { result: string } }>("select public.match_payment_sms($1, $2, 'X1234', 'GCash', 'You have received ...') as r", [SECRET, rows[0].total]),
    );
    expect(r.rows[0].r.result).toBe("no_match");
    const after = await db.query<{ status: string }>("select status from public.orders where tracking_token = $1", [token]);
    expect(after.rows[0].status).toBe("pending");
  });
});

describe("QR with the amount filled in", () => {
  it("orders keep the method's QR Ph text; junk isn't accepted", async () => {
    const payload = "00020101021127330012com.p2pqrpay0111GXCHPHM2XXX5204601653036085802PH5904TEST6006MANILA6304ABCD";
    const id = (
      await db.query<{ id: string }>(
        "insert into public.payment_methods (store_id, type, label, account_name, account_number, qr_payload) values ($1, 'gcash', 'GCash QR2', 'Shop', '09170000000', $2) returning id",
        [store.id, payload],
      )
    ).rows[0].id;
    const item = await addProduct({ name: "Webcam", slug: "qr-webcam", price: 1200, stock: 5 });
    const token = (await placeOrder(null, [{ product_id: item, quantity: 1 }], { payment: id, contact: { ...contact, email: "qr@example.com" } })).tracking_token;
    const { rows } = await db.query<{ p: string }>("select payment_method->>'qr_payload' as p from public.orders where tracking_token = $1", [token]);
    expect(rows[0].p).toBe(payload);
    await rejects(db.query("update public.payment_methods set qr_payload = 'https://evil.example' where id = $1", [id]), "check");
  });
});
