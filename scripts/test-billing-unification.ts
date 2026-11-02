import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55432");
  assert.equal(url.pathname, "/laconic_local");
  for (const file of ["text-worker", "video-worker", "payment-worker"])
    if (existsSync(`.local/${file}.pid`)) {
      try {
        process.kill(Number(readFileSync(`.local/${file}.pid`, "utf8")), 0);
        throw Error("Stop managed workers before isolated fixtures");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e;
      }
    }
  Object.assign(process.env, {
    STRIPE_ENABLED: "true",
    STRIPE_ENVIRONMENT: "test",
    STRIPE_API_KEY: "sk_test_AUD004_fixture",
    STRIPE_ACCOUNT_ID: "acct_AUD004",
    STRIPE_WEBHOOK_SECRET: "whsec_AUD004_fixture",
    STRIPE_PRICE_STARTER: "price_starter",
    STRIPE_PRICE_STANDARD: "price_standard",
    STRIPE_SUB_BASIC_MONTHLY: "price_basic_month",
    CREEM_ENABLED: "true",
    CREEM_ENVIRONMENT: "test",
    CREEM_ACCOUNT_SCOPE: "AUD004_creem",
    CREEM_API_KEY: "creem_test_AUD004_fixture",
    CREEM_WEBHOOK_SECRET: "AUD004_creem_secret",
    CREEM_PRODUCT_STARTER: "prod_starter",
    CREEM_PRODUCT_STANDARD: "prod_standard",
    CREEM_SUB_BASIC_MONTHLY: "prod_basic_month",
    PAYMENT_RETURN_BASE_URL: "https://test.local.example",
  });
  const {
    db,
    users,
    customers,
    paymentOrders,
    paymentFulfillments,
    paymentEvents,
    billingSubscriptions,
    billingCycles,
    creemSubscriptions,
    creditPackages,
    creditTransactions,
    adminOperations,
  } = await import("../src/db");
  const { eq, and, sql, inArray } = await import("drizzle-orm");
  const {
    reserveOrder,
    processOrder,
    receivePaymentEvent,
    recoverPaymentEvent,
  } = await import("../src/services/orders");
  const { receiveSubscriptionEvent, listSubscriptions, changeSubscription } =
    await import("../src/services/subscriptions");
  const { verifyStripe } = await import("../src/payment/providers/stripe");
  const { verifyCreem } = await import("../src/payment/providers/creem");
  const { subscriptionCatalog } = await import(
    "../src/payment/billing-catalog"
  );
  const { getStripe } = await import("../src/payment");
  const stripe = getStripe() as any;
  const ids = [randomUUID(), randomUUID()];
  const prefix = "AUD004_" + randomUUID().slice(0, 8);
  const passed: string[] = [];
  const pass = (s: string) => {
    passed.push(s);
    console.log("PASS " + s);
  };
  const stripeSessions = new Map<string, any>();
  const stripeSubs = new Map<string, any>();
  const invoices = new Map<string, any>();
  const creemCheckouts = new Map<string, any>();
  const creemSubs = new Map<string, any>();
  const transactions = new Map<string, any>();
  const creates = { stripe: 0, creem: 0 };
  const fetchOriginal = globalThis.fetch;
  let counter = 0;
  let lostStripe = false;
  let lostCreem = false;
  const clone = (v: any) => JSON.parse(JSON.stringify(v));
  stripe.rawRequest = async (method: string, path: string) => {
    assert.equal(path, "/v1/account");
    return { id: "acct_AUD004" };
  };
  stripe.prices.retrieve = async (id: string) => ({
    id,
    unit_amount:
      id === "price_basic_month" ? 990 : id === "price_starter" ? 500 : 1500,
    currency: "usd",
    active: true,
    livemode: false,
    recurring: id === "price_basic_month" ? { interval: "month" } : null,
  });
  stripe.checkout.sessions.create = async (data: any, options: any) => {
    let s = stripeSessions.get(options.idempotencyKey);
    if (!s) {
      creates.stripe++;
      s = {
        id: "cs_test_" + ++counter,
        url: "https://checkout.stripe.com/c/pay/" + counter,
        mode: data.mode,
        payment_status: "unpaid",
        status: "open",
        metadata: data.metadata,
        client_reference_id: data.client_reference_id,
        livemode: false,
        currency: "usd",
        amount_total: data.line_items[0].price === "price_starter" ? 500 : 990,
        payment_intent: null,
      };
      stripeSessions.set(options.idempotencyKey, s);
      stripeSessions.set(s.id, s);
    }
    if (lostStripe) {
      lostStripe = false;
      throw Error("Lost create response");
    }
    return clone(s);
  };
  stripe.checkout.sessions.retrieve = async (id: string) =>
    clone(stripeSessions.get(id));
  stripe.subscriptions.retrieve = async (id: string) =>
    clone(stripeSubs.get(id));
  stripe.subscriptions.update = async (id: string, data: any) => {
    const sub = stripeSubs.get(id);
    sub.cancel_at_period_end = data.cancel_at_period_end;
    return clone(sub);
  };
  stripe.invoices.retrieve = async (id: string) => clone(invoices.get(id));
  globalThis.fetch = async (input: any, init: any = {}) => {
    const href = String(input);
    if (!href.startsWith("https://test-api.creem.io/"))
      throw Error(
        "Unexpected external HTTP in billing fixture: " +
          new URL(href).hostname,
      );
    const u = new URL(href);
    const body = init.body ? JSON.parse(init.body) : {};
    let response: any;
    if (u.pathname === "/v1/products") {
      const id = u.searchParams.get("product_id");
      response = {
        id,
        mode: "test",
        price:
          id === "prod_basic_month" ? 990 : id === "prod_starter" ? 500 : 1500,
        currency: "USD",
        billing_type: id === "prod_basic_month" ? "recurring" : "onetime",
        billing_period: "every-month",
      };
    } else if (u.pathname === "/v1/checkouts" && init.method === "POST") {
      response = creemCheckouts.get(body.request_id);
      if (!response) {
        creates.creem++;
        response = {
          id: "ch_" + ++counter,
          mode: "test",
          checkout_url: "https://checkout.creem.io/" + counter,
          status: "pending",
          product: body.product_id,
          request_id: body.request_id,
          metadata: body.metadata,
        };
        creemCheckouts.set(body.request_id, response);
        creemCheckouts.set(response.id, response);
      }
      if (lostCreem) {
        lostCreem = false;
        throw Error("Lost create response");
      }
    } else if (u.pathname === "/v1/checkouts")
      response = creemCheckouts.get(u.searchParams.get("checkout_id")!);
    else if (u.pathname === "/v1/subscriptions")
      response = creemSubs.get(u.searchParams.get("subscription_id")!);
    else if (u.pathname === "/v1/transactions")
      response = transactions.get(u.searchParams.get("transaction_id")!);
    else if (/\/v1\/subscriptions\/[^/]+\/(cancel|resume)$/.test(u.pathname)) {
      const sub = creemSubs.get(u.pathname.split("/")[3]);
      sub.status = u.pathname.endsWith("/cancel")
        ? "scheduled_cancel"
        : "active";
      response = sub;
    } else throw Error("Unexpected Creem fixture endpoint");
    return Response.json(clone(response));
  };
  async function counts(userId = ids[0]) {
    return (
      await db
        .select({
          packages: sql<number>`count(*)::int`,
          credits: sql<number>`coalesce(sum(${creditPackages.remainingCredits}),0)::int`,
        })
        .from(creditPackages)
        .where(eq(creditPackages.userId, userId))
    )[0];
  }
  async function stripeEvent(
    type: string,
    object: any,
    eventId = prefix + "_" + randomUUID(),
  ) {
    const payload = JSON.stringify({
        id: eventId,
        object: "event",
        type,
        livemode: false,
        created: Math.floor(Date.now() / 1000),
        data: { object },
      });
    const signature = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: process.env.STRIPE_WEBHOOK_SECRET,
      });
    return verifyStripe(
      new Request("http://localhost/webhook", {
        headers: { "stripe-signature": signature },
      }),
      payload,
    );
  }
  async function creemEvent(
    type: string,
    object: any,
    eventId = prefix + "_" + randomUUID(),
  ) {
    const payload = JSON.stringify({
        id: eventId,
        eventType: type,
        created_at: Date.now(),
        object,
      });
    const signature = createHmac("sha256", process.env.CREEM_WEBHOOK_SECRET!)
        .update(payload)
        .digest("hex");
    return verifyCreem(
      new Request("http://localhost/webhook", {
        headers: { "creem-signature": signature },
      }),
      payload,
    );
  }
  async function forceDue(id: string) {
    await db
      .update(paymentOrders)
      .set({ nextCheckAt: new Date(Date.now() - 1000) })
      .where(eq(paymentOrders.id, id));
  }
  try {
    for (const id of ids) {
      await db.insert(users).values({
        id,
        name: "Billing isolated fixture",
        email: `${prefix}_${id}@laconic.local`,
        emailVerified: true,
        isAdmin: id === ids[0],
      });
      await db
        .insert(customers)
        .values({ authUserId: id, name: "Billing fixture", plan: "FREE" });
    }
    for (const provider of ["stripe", "creem"] as const) {
      const input = { requestId: randomUUID(), provider, productId: "starter" };
      const reserved = await Promise.all(
        Array.from({ length: 6 }, () => reserveOrder(ids[0], input)),
      );
      assert.equal(new Set(reserved.map((r) => r.id)).size, 1);
      const order = reserved[0];
      if (provider === "stripe") lostStripe = true;
      else lostCreem = true;
      await forceDue(order.id);
      await processOrder(order.id);
      await forceDue(order.id);
      await processOrder(order.id);
      assert.equal(creates[provider], 1);
      const [pending] = await db
        .select()
        .from(paymentOrders)
        .where(eq(paymentOrders.id, order.id));
      assert.equal(pending.status, "PENDING");
      assert(pending.checkoutUrl);
      const unpaid =
        provider === "stripe"
          ? await stripeEvent(
              "checkout.session.completed",
              stripeSessions.get(pending.externalId!),
            )
          : await creemEvent(
              "checkout.completed",
              creemCheckouts.get(pending.externalId!),
            );
      await receivePaymentEvent(unpaid);
      assert.equal(
        (
          await db
            .select()
            .from(paymentFulfillments)
            .where(eq(paymentFulfillments.orderId, order.id))
        ).length,
        0,
      );
      if (provider === "stripe") {
        const s = stripeSessions.get(pending.externalId!);
        s.payment_status = "paid";
        s.status = "complete";
        s.payment_intent = {
          id: "pi_" + randomUUID(),
          status: "succeeded",
          amount_received: 500,
          currency: "usd",
        };
      } else {
        const s = creemCheckouts.get(pending.externalId!);
        s.status = "completed";
        s.order = {
          id: "ord_" + randomUUID(),
          transaction: "tran_" + randomUUID(),
          mode: "test",
          status: "paid",
          amount: 500,
          amount_paid: 500,
          currency: "USD",
          product: "prod_starter",
        };
      }
      const event =
        provider === "stripe"
          ? await stripeEvent(
              "checkout.session.completed",
              stripeSessions.get(pending.externalId!),
            )
          : await creemEvent(
              "checkout.completed",
              creemCheckouts.get(pending.externalId!),
            );
      await Promise.all(
        Array.from({ length: 8 }, () => receivePaymentEvent(event)),
      );
      assert.equal(
        (
          await db
            .select()
            .from(paymentFulfillments)
            .where(eq(paymentFulfillments.orderId, order.id))
        ).length,
        1,
      );
      const before = await counts();
      await assert.rejects(() =>
        receivePaymentEvent({
          ...event,
          id: event.id + "_bad",
          fact: { ...event.fact!, amount: 501 },
        }),
      );
      assert.deepEqual(await counts(), before);
      const { createRefund } = await import("../src/services/refunds");
      const flag = provider === "stripe" ? "STRIPE_ENABLED" : "CREEM_ENABLED";
      process.env[flag] = "false";
      await assert.rejects(
        () =>
          createRefund(ids[0], {
            requestId: randomUUID(),
            orderId: order.id,
            amount: 500,
            reason: "退款请求需阻止配置环境变更",
          }),
        (e) => (e as { status?: number }).status === 503,
      );
      process.env[flag] = "true";
      assert.deepEqual(await counts(), before);
      pass(
        `${provider}: replayed create/lost response use one checkout; unpaid grants nothing; 8 signed notification replays fulfill once; mismatched amount rejected`,
      );
    }
    await assert.rejects(() =>
      verifyStripe(
        new Request("http://localhost", {
          headers: { "stripe-signature": "bad" },
        }),
        "{}",
      ),
    );
    await assert.rejects(() =>
      verifyCreem(
        new Request("http://localhost", {
          headers: { "creem-signature": "0".repeat(64) },
        }),
        "{}",
      ),
    );
    const now = Date.now();
    const periods = [
        {
          start: new Date(now - 1000).toISOString(),
          end: new Date(now + 30 * 86400000).toISOString(),
        },
        {
          start: new Date(now + 30 * 86400000).toISOString(),
          end: new Date(now + 60 * 86400000).toISOString(),
        },
      ];
    for (const provider of ["stripe", "creem"] as const) {
      const product = subscriptionCatalog[0];
      const order = await reserveOrder(ids[0], {
          requestId: randomUUID(),
          provider,
          productId: product.id,
        });
      await forceDue(order.id);
      await processOrder(order.id);
      const ext =
          provider === "stripe"
            ? "sub_stripe_" + randomUUID()
            : "sub_creem_" + randomUUID();
      const customer =
          provider === "stripe"
            ? "cus_" + randomUUID()
            : "cust_" + randomUUID();
      const fact = {
        provider,
        environment: "test",
        accountId: provider === "stripe" ? "acct_AUD004" : "AUD004_creem",
        externalId: ext,
        customerId: customer,
        userId: ids[0],
        checkoutOrderId: order.id,
        productId:
          provider === "stripe" ? "price_basic_month" : "prod_basic_month",
        status: "active",
        cancelAtPeriodEnd: false,
        periodStart: periods[0].start,
        periodEnd: periods[0].end,
        observedAt: new Date().toISOString(),
      };
      if (provider === "stripe")
        stripeSubs.set(ext, {
          id: ext,
          customer,
          metadata: { userId: ids[0], orderId: order.id },
          status: "active",
          cancel_at_period_end: false,
          livemode: false,
          items: {
            data: [
              {
                id: "si_" + ext,
                quantity: 1,
                price: { id: "price_basic_month" },
                current_period_start: Math.floor(
                  new Date(periods[0].start).getTime() / 1000,
                ),
                current_period_end: Math.floor(
                  new Date(periods[0].end).getTime() / 1000,
                ),
              },
            ],
          },
        });
      else
        creemSubs.set(ext, {
          id: ext,
          mode: "test",
          customer,
          product: "prod_basic_month",
          metadata: { userId: ids[0], orderId: order.id },
          status: "active",
          items: [{ units: 1 }],
          current_period_start_date: periods[0].start,
          current_period_end_date: periods[0].end,
        });
      const before = await counts();
      await receiveSubscriptionEvent({
        id: prefix + "_active_" + ext,
        type: "subscription.active",
        provider,
        environment: "test",
        accountId: fact.accountId,
        subscription: fact,
      });
      assert.deepEqual(await counts(), before);
      for (let n = 0; n < 2; n++) {
        const p = periods[n];
        let event: any;
        if (provider === "stripe") {
          const sub = stripeSubs.get(ext);
          sub.items.data[0].current_period_start = Math.floor(
            new Date(p.start).getTime() / 1000,
          );
          sub.items.data[0].current_period_end = Math.floor(
            new Date(p.end).getTime() / 1000,
          );
          const invoice = {
            id: "in_" + randomUUID(),
            status: "paid",
            paid: true,
            livemode: false,
            billing_reason: n ? "subscription_cycle" : "subscription_create",
            amount_paid: 990,
            amount_due: 990,
            amount_remaining: 0,
            currency: "usd",
            parent: { subscription_details: { subscription: ext } },
            lines: {
              data: [
                {
                  parent: {
                    subscription_item_details: {
                      subscription_item: "si_" + ext,
                    },
                  },
                  pricing: { price_details: { price: "price_basic_month" } },
                  amount: 990,
                  period: {
                    start: Math.floor(new Date(p.start).getTime() / 1000),
                    end: Math.floor(new Date(p.end).getTime() / 1000),
                  },
                },
              ],
            },
          };
          invoices.set(invoice.id, invoice);
          event = await stripeEvent("invoice.paid", invoice);
        } else {
          const sub = creemSubs.get(ext);
          const id = "tran_" + randomUUID();
          sub.current_period_start_date = p.start;
          sub.current_period_end_date = p.end;
          sub.last_transaction_id = id;
          transactions.set(id, {
            id,
            mode: "test",
            status: "paid",
            type: "invoice",
            subscription: ext,
            customer,
            amount: 990,
            amount_paid: 990,
            currency: "USD",
            period_start: p.start,
            period_end: p.end,
          });
          event = await creemEvent("subscription.paid", sub);
        }
        await Promise.all(
          Array.from({ length: 6 }, () => receivePaymentEvent(event)),
        );
        const rows = await db
          .select()
          .from(billingSubscriptions)
          .where(eq(billingSubscriptions.externalId, ext));
        const cycles = await db
          .select()
          .from(billingCycles)
          .where(eq(billingCycles.subscriptionId, rows[0].id));
        assert.equal(cycles.length, n + 1);
        const snapshot = await counts();
        await receivePaymentEvent({ ...event, id: event.id + "_alternate" });
        assert.deepEqual(await counts(), snapshot);
      }
      assert.equal((await counts()).credits, before.credits + 560);
      const [row] = await db
        .select()
        .from(billingSubscriptions)
        .where(eq(billingSubscriptions.externalId, ext));
      const credits = await counts();
      await assert.rejects(() => changeSubscription(ids[1], row.id, "cancel"));
      await changeSubscription(ids[0], row.id, "cancel");
      assert(
        (await listSubscriptions(ids[0])).find((s) => s.id === row.id)
          ?.cancelAtPeriodEnd,
      );
      assert.deepEqual(await counts(), credits);
      await changeSubscription(ids[0], row.id, "resume");
      assert.equal(
        (await listSubscriptions(ids[0])).find((s) => s.id === row.id)
          ?.cancelAtPeriodEnd,
        false,
      );
      assert.deepEqual(await counts(), credits);
      // A second cancellation after resume must not be swallowed by a cached operation ID.
      await changeSubscription(ids[0], row.id, "cancel");
      assert(
        (await listSubscriptions(ids[0])).find((s) => s.id === row.id)
          ?.cancelAtPeriodEnd,
      );
      await changeSubscription(ids[0], row.id, "resume");
      await receiveSubscriptionEvent({
        id: prefix + "_stale_" + ext,
        type: "subscription.updated",
        provider,
        environment: "test",
        accountId: fact.accountId,
        subscription: {
          ...fact,
          status: "canceled",
          observedAt: new Date(now - 60000).toISOString(),
        },
      });
      assert.equal(
        (await listSubscriptions(ids[0])).find((s) => s.id === row.id)?.status,
        "active",
      );
      pass(
        `${provider}: active alone no credits; two paid cycles each grant once across concurrent/different events; own-user cancel/resume/cancel preserves credits; stale state cannot override newer confirmation`,
      );
    }
    // Atomic rollback after a cycle's credit insert, then durable recovery without a second paid checkout.
    const fault = "aud004_" + randomUUID().slice(0, 8);
    const fid = prefix + "_fault";
    const subId = "sub_fault_" + randomUUID();
    const failure: any = {
      id: fid,
      type: "subscription.paid",
      provider: "creem",
      environment: "test",
      accountId: "AUD004_creem",
      subscription: {
        provider: "creem",
        environment: "test",
        accountId: "AUD004_creem",
        externalId: subId,
        customerId: "cust_fault_" + randomUUID(),
        userId: ids[0],
        productId: "prod_basic_month",
        status: "active",
        cancelAtPeriodEnd: false,
        periodStart: periods[0].start,
        periodEnd: periods[0].end,
        observedAt: new Date().toISOString(),
        payment: {
          id: "tran_fault_" + randomUUID(),
          amount: 990,
          currency: "USD",
          periodStart: periods[0].start,
          periodEnd: periods[0].end,
        },
      },
    };
    await db.execute(
      sql.raw(
        `CREATE FUNCTION ${fault}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id='${ids[0]}' THEN RAISE EXCEPTION 'AUD004 atomic fixture'; END IF; RETURN NEW; END $$`,
      ),
    );
    await db.execute(
      sql.raw(
        `CREATE TRIGGER ${fault} BEFORE INSERT ON credit_transactions FOR EACH ROW EXECUTE FUNCTION ${fault}()`,
      ),
    );
    const snap = await counts();
    try {
      await assert.rejects(() => receivePaymentEvent(failure));
      assert.deepEqual(await counts(), snap);
    } finally {
      await db.execute(sql.raw(`DROP TRIGGER ${fault} ON credit_transactions`));
      await db.execute(sql.raw(`DROP FUNCTION ${fault}()`));
    }
    await db
      .update(paymentEvents)
      .set({ nextAttemptAt: new Date(Date.now() + 86400000) })
      .where(sql`${paymentEvents.accountId} in ('acct_AUD004','AUD004_creem')`);
    await db
      .update(paymentEvents)
      .set({ nextAttemptAt: new Date(Date.now() - 1000) })
      .where(eq(paymentEvents.eventId, fid));
    assert(await recoverPaymentEvent());
    assert.equal((await counts()).credits, snap.credits + 280);
    await receivePaymentEvent(failure);
    assert.equal((await counts()).credits, snap.credits + 280);
    pass(
      "subscription fulfillment rollback is atomic; persisted normalized receipt recovers once without a paid HTTP retry",
    );
    // Old Creem first-period grant is adopted; the following period can still earn new credits.
    const legacyId = "sub_legacy_" + randomUUID();
    const legacyPay = "tran_legacy_" + randomUUID();
    const [pkg] = await db
      .insert(creditPackages)
      .values({
        userId: ids[1],
        initialCredits: 280,
        remainingCredits: 280,
        frozenCredits: 0,
        transType: "SUBSCRIPTION",
        orderNo: `creem_sub_${legacyId}`,
        status: "ACTIVE",
        createdAt: new Date(),
        expiredAt: new Date(periods[0].end),
      })
      .returning();
    await db.insert(creditTransactions).values({
      transNo: "LEGACY_" + randomUUID(),
      userId: ids[1],
      transType: "SUBSCRIPTION",
      credits: 280,
      balanceAfter: 280,
      packageId: pkg.id,
      orderNo: `creem_sub_${legacyId}`,
    });
    await db.insert(creemSubscriptions).values({
      userId: ids[1],
      productId: "prod_basic_month",
      subscriptionId: legacyId,
      status: "active",
      currentPeriodEnd: new Date(periods[0].end),
    });
    const legacy: any = {
      id: prefix + "_legacy",
      type: "subscription.paid",
      provider: "creem",
      environment: "test",
      accountId: "AUD004_creem",
      subscription: {
        ...failure.subscription,
        externalId: legacyId,
        customerId: "cust_legacy_" + randomUUID(),
        userId: undefined,
        payment: { ...failure.subscription.payment, id: legacyPay },
      },
    };
    await receivePaymentEvent(legacy);
    assert.equal((await counts(ids[1])).credits, 280);
    assert.equal((await counts(ids[1])).packages, 1);
    await receivePaymentEvent({
      ...legacy,
      id: prefix + "_legacy_renew",
      subscription: {
        ...legacy.subscription,
        periodStart: periods[1].start,
        periodEnd: periods[1].end,
        payment: {
          ...legacy.subscription.payment,
          id: "tran_renew_" + randomUUID(),
          periodStart: periods[1].start,
          periodEnd: periods[1].end,
        },
      },
    });
    assert.equal((await counts(ids[1])).credits, 560);
    pass(
      "legacy Creem receipt links without reminting its first-period credits; next period grants normally",
    );
    const stripeLegacyId = "sub_legacy_stripe_" + randomUUID();
    await db
      .update(customers)
      .set({
        stripeSubscriptionId: stripeLegacyId,
        stripeCustomerId: "cus_legacy_" + randomUUID(),
      })
      .where(eq(customers.authUserId, ids[1]));
    const oldStripe: any = {
      ...legacy,
      id: prefix + "_stripe_legacy",
      provider: "stripe",
      accountId: "acct_AUD004",
      subscription: {
        ...legacy.subscription,
        provider: "stripe",
        accountId: "acct_AUD004",
        externalId: stripeLegacyId,
        productId: "price_basic_month",
        customerId: "cus_old_stripe_" + randomUUID(),
        payment: {
          ...legacy.subscription.payment,
          id: "in_legacy_" + randomUUID(),
        },
      },
    };
    const initial = await counts(ids[1]);
    await receivePaymentEvent(oldStripe);
    await receivePaymentEvent(oldStripe);
    assert.equal((await counts(ids[1])).credits, initial.credits + 280);
    await receivePaymentEvent({
      ...oldStripe,
      id: prefix + "_stripe_legacy_renew",
      subscription: {
        ...oldStripe.subscription,
        periodStart: periods[1].start,
        periodEnd: periods[1].end,
        payment: {
          ...oldStripe.subscription.payment,
          id: "in_legacy2_" + randomUUID(),
          periodStart: periods[1].start,
          periodEnd: periods[1].end,
        },
      },
    });
    assert.equal((await counts(ids[1])).credits, initial.credits + 560);
    pass(
      "legacy Stripe Customer association works without new metadata; two invoices fulfill once each",
    );
    const beforeReject = await counts(ids[1]);
    for (const patch of [
      { environment: "live" },
      { accountId: "another-account" },
      { userId: ids[0] },
      {
        payment: {
          ...oldStripe.subscription.payment,
          id: "in_bad_" + randomUUID(),
          currency: "EUR",
        },
      },
      {
        payment: {
          ...oldStripe.subscription.payment,
          id: "in_other_" + randomUUID(),
        },
      },
      {
        payment: {
          ...oldStripe.subscription.payment,
          id: "in_overlap_" + randomUUID(),
          periodEnd: new Date(
            new Date(periods[0].end).getTime() - 1000,
          ).toISOString(),
        },
      },
    ]) {
      await assert.rejects(() =>
        receivePaymentEvent({
          ...oldStripe,
          id: prefix + "_reject_" + randomUUID(),
          subscription: { ...oldStripe.subscription, ...patch },
        }),
      );
      assert.deepEqual(await counts(ids[1]), beforeReject);
    }
    pass(
      "wrong environment/account/user/currency, another receipt for one cycle and overlapping periods never grant credits",
    );
    const expEnd = new Date(now - 86400000).toISOString();
    const expStart = new Date(now - 31 * 86400000).toISOString();
    const expired: any = {
        ...failure,
        id: prefix + "_expired",
        subscription: {
          ...failure.subscription,
          externalId: "sub_expired_" + randomUUID(),
          customerId: "cust_expired_" + randomUUID(),
          periodStart: expStart,
          periodEnd: expEnd,
          payment: {
            ...failure.subscription.payment,
            id: "tran_expired_" + randomUUID(),
            periodStart: expStart,
            periodEnd: expEnd,
          },
        },
      };
    await receivePaymentEvent(expired);
    const [expiredSub] = await db
      .select()
      .from(billingSubscriptions)
      .where(
        eq(billingSubscriptions.externalId, expired.subscription.externalId),
      );
    const [cycle] = await db
      .select()
      .from(billingCycles)
      .where(eq(billingCycles.subscriptionId, expiredSub.id));
    const [receipt] = await db
      .select()
      .from(paymentFulfillments)
      .where(eq(paymentFulfillments.orderId, cycle.orderId));
    const [expiredPackage] = await db
      .select()
      .from(creditPackages)
      .where(eq(creditPackages.id, receipt.packageId));
    assert.equal(expiredPackage.expiredAt?.toISOString(), expEnd);
    assert.equal(
      (await listSubscriptions(ids[0])).find((s) => s.id === expiredSub.id)
        ?.hasAccess,
      false,
    );
    const terminal: any = {
      ...expired,
      id: prefix + "_terminal",
      subscription: {
        ...expired.subscription,
        status: "canceled",
        payment: undefined,
        observedAt: new Date().toISOString(),
      },
    };
    await receivePaymentEvent(terminal);
    creemSubs.set(expired.subscription.externalId, {
      id: expired.subscription.externalId,
      mode: "test",
      customer: expired.subscription.customerId,
      product: "prod_basic_month",
      metadata: { userId: ids[0] },
      status: "canceled",
      items: [{ units: 1 }],
      current_period_start_date: expStart,
      current_period_end_date: expEnd,
    });
    await assert.rejects(() =>
      changeSubscription(ids[0], expiredSub.id, "resume"),
    );
    pass(
      "late historical payment preserves its original expiry; ended subscriptions have no paid access and cannot resume as an active plan",
    );
    const { getUserPlans } = await import("../src/services/billing");
    assert.equal((await getUserPlans(ids[0]))?.isPaid, true);
    const [firstStripe] = await db
      .select()
      .from(billingSubscriptions)
      .where(
        and(
          eq(billingSubscriptions.userId, ids[0]),
          eq(billingSubscriptions.provider, "stripe"),
        ),
      );
    const endState: any = {
      ...oldStripe,
      id: prefix + "_stripe_terminal",
      subscription: {
        ...oldStripe.subscription,
        externalId: firstStripe.externalId,
        customerId: firstStripe.customerId,
        userId: ids[0],
        status: "canceled",
        periodStart: firstStripe.periodStart.toISOString(),
        periodEnd: firstStripe.periodEnd.toISOString(),
        observedAt: new Date(Date.now() + 1000).toISOString(),
        payment: undefined,
      },
    };
    await receivePaymentEvent(endState);
    assert.equal((await getUserPlans(ids[0]))?.isPaid, false);
    pass(
      "legacy Stripe plan projection observes canceled status rather than granting an extra grace day",
    );
    writeFileSync(
      "docs/project-state/aud-004-billing-results.json",
      JSON.stringify(
        { testedAt: new Date().toISOString(), passed, realProviderCalls: 0 },
        null,
        2,
      ) + "\n",
    );
  } finally {
    globalThis.fetch = fetchOriginal;
    await db.transaction(async (tx) => {
      const owned = await tx
        .select({ id: billingSubscriptions.id })
        .from(billingSubscriptions)
        .where(inArray(billingSubscriptions.userId, ids));
      if (owned.length)
        await tx.delete(billingCycles).where(
          inArray(
            billingCycles.subscriptionId,
            owned.map((s) => s.id),
          ),
        );
      await tx
        .delete(billingSubscriptions)
        .where(inArray(billingSubscriptions.userId, ids));
      await tx
        .delete(creemSubscriptions)
        .where(inArray(creemSubscriptions.userId, ids));
      await tx
        .delete(paymentEvents)
        .where(
          sql`${paymentEvents.accountId} in ('acct_AUD004','AUD004_creem')`,
        );
      const orders = await tx
        .select({ id: paymentOrders.id })
        .from(paymentOrders)
        .where(inArray(paymentOrders.userId, ids));
      if (orders.length)
        await tx.delete(paymentFulfillments).where(
          inArray(
            paymentFulfillments.orderId,
            orders.map((o) => o.id),
          ),
        );
      await tx.delete(paymentOrders).where(inArray(paymentOrders.userId, ids));
      await tx
        .delete(creditTransactions)
        .where(inArray(creditTransactions.userId, ids));
      await tx
        .delete(creditPackages)
        .where(inArray(creditPackages.userId, ids));
      await tx.delete(customers).where(inArray(customers.authUserId, ids));
      await tx.delete(users).where(inArray(users.id, ids));
    });
    await db.$client.end();
    console.log(
      "Billing fixtures cleaned; no real payments or provider calls.",
    );
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
