import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55432");
  assert.equal(url.pathname, "/laconic_local");
  for (const n of ["text", "video", "payment"]) {
    if (existsSync(`.local/${n}-worker.pid`)) {
      let alive = false;
      try {
        process.kill(Number(readFileSync(`.local/${n}-worker.pid`, "utf8")), 0);
        alive = true;
      } catch {}
      assert(!alive, "Stop managed workers before fixtures");
    }
  }
  Object.assign(process.env, {
    STRIPE_ENABLED: "true",
    STRIPE_ENVIRONMENT: "test",
    STRIPE_API_KEY: "sk_test_AUD005_fixture",
    STRIPE_ACCOUNT_ID: "acct_AUD005",
    STRIPE_WEBHOOK_SECRET: "whsec_AUD005",
    STRIPE_PRICE_STARTER: "price_AUD005",
    CREEM_ENABLED: "true",
    CREEM_ENVIRONMENT: "test",
    CREEM_API_KEY: "creem_test_AUD005",
    CREEM_ACCOUNT_SCOPE: "AUD005",
    CREEM_WEBHOOK_SECRET: "AUD005_secret",
    CREEM_PRODUCT_STARTER: "prod_AUD005",
    PAYPAL_ENABLED: "true",
    PAYPAL_ENVIRONMENT: "sandbox",
    PAYPAL_CLIENT_ID: "AUD005",
    PAYPAL_CLIENT_SECRET: "AUD005",
    PAYPAL_MERCHANT_ID: "AUD005",
    PAYPAL_WEBHOOK_ID: "WH_AUD005",
    WAFFO_ENABLED: "true",
    WAFFO_ENVIRONMENT: "test",
    WAFFO_MERCHANT_ID: "AUD005",
    WAFFO_STORE_ID: "AUD005",
  });
  const { generateKeyPairSync } = await import("node:crypto");
  const keys = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  process.env.WAFFO_PRIVATE_KEY = keys.privateKey;
  process.env.WAFFO_WEBHOOK_PUBLIC_KEY = keys.publicKey;
  process.env.WAFFO_PRODUCT_STARTER = "PROD_AUD005";
  const {
    db,
    users,
    paymentOrders,
    paymentEvents,
    paymentFulfillments,
    paymentRefunds,
    paymentRefundReviews,
    paymentOperations,
    creditPackages,
    creditTransactions,
    billingSubscriptions,
    billingCycles,
  } = await import("../src/db");
  const { and, eq, inArray, sql } = await import("drizzle-orm");
  const { reserveOrder, receivePaymentEvent, fulfillPayment } = await import(
    "../src/services/orders"
  );
  const {
    paymentOperation,
    processPaymentOperation,
    getPaymentOperation,
    listPaymentOperations,
    paymentOpsQuerySchema,
  } = await import("../src/services/payment-operations");
  const { getStripe } = await import("../src/payment");
  const stripe = getStripe() as any;
  const ids: string[] = [],
    passed: string[] = [],
    http: string[] = [],
    queries = new Map<string, any>();
  let approved = false;
  const original = globalThis.fetch;
  stripe._requestSender._request = () => {
    throw Error("Unexpected Stripe external request");
  };
  stripe.rawRequest = async () => ({ id: "acct_AUD005" });
  stripe.checkout.sessions.retrieve = async (id: string) =>
    structuredClone(queries.get(id));
  globalThis.fetch = async (input, init: any = {}) => {
    const u = new URL(String(input));
    http.push(`${init.method || "GET"} ${u.pathname}`);
    if (u.hostname === "api-m.sandbox.paypal.com") {
      if (u.pathname === "/v1/oauth2/token")
        return Response.json({ access_token: "fixture" });
      assert.equal(
        init.method || "GET",
        "GET",
        "Operations must not capture/create/refund cash",
      );
      const data = queries.get(u.pathname.split("/").at(-1)!);
      if (data)
        return Response.json({
          ...data,
          status: approved ? "APPROVED" : data.status,
        });
    }
    if (u.hostname === "test-api.creem.io" && u.pathname === "/v1/checkouts")
      return Response.json(queries.get(u.searchParams.get("checkout_id")!));
    if (u.hostname === "pancake.waffo.ai" || u.hostname.includes("waffo"))
      return Response.json({
        data: {
          onetimeOrders: [
            { status: "completed", priceSnapshot: { amount: "5.00" } },
          ],
        },
      });
    throw Error("Unexpected external payment operation HTTP");
  };
  const pass = (s: string) => {
    passed.push(s);
    console.log("PASS " + s);
  };
  async function user(admin = false) {
    const id = randomUUID();
    ids.push(id);
    await db
      .insert(users)
      .values({
        id,
        email: `AUD005-${id}@example.invalid`,
        name: "Payment operations isolated fixture",
        isAdmin: admin,
        emailVerified: true,
      });
    return id;
  }
  async function order(
    provider: "paypal" | "waffo" | "stripe" | "creem" = "waffo",
  ) {
    const uid = await user(),
      o = await reserveOrder(uid, {
        requestId: randomUUID(),
        provider,
        productId: "starter",
      });
    const externalId =
      (provider === "stripe"
        ? "cs_test_"
        : provider === "creem"
          ? "ch_"
          : "ORDER") + randomUUID().replaceAll("-", "");
    await db
      .update(paymentOrders)
      .set({ externalId, status: "PENDING" })
      .where(eq(paymentOrders.id, o.id));
    const fact = {
      provider,
      environment: o.environment,
      accountId: o.accountId,
      internalId: o.id,
      externalId,
      paymentId:
        provider === "stripe" ? "pi_" + randomUUID() : "PAY" + randomUUID(),
      amount: 500,
      currency: "USD",
    };
    const event = {
      id: "evt_" + randomUUID(),
      type:
        provider === "waffo"
          ? "order.completed"
          : "fixture.preverified.payment",
      provider,
      environment: o.environment,
      accountId: o.accountId,
      internalId: o.id,
      externalId,
      fact,
    };
    return { o: { ...o, externalId }, uid, fact, event };
  }
  async function saved(
    o: Awaited<ReturnType<typeof order>>,
    status = "VERIFIED",
  ) {
    await db
      .insert(paymentEvents)
      .values({
        provider: o.event.provider,
        environment: o.event.environment,
        accountId: o.event.accountId,
        eventId: o.event.id,
        eventType: o.event.type,
        orderId: o.o.id,
        status,
        normalizedEvent: o.event,
      });
  }
  const eventKey = (e: {
    provider: "paypal" | "waffo" | "stripe" | "creem";
    environment: string;
    accountId: string;
    id: string;
  }) => ({
    provider: e.provider,
    environment: e.environment as "test" | "sandbox",
    accountId: e.accountId,
    eventId: e.id,
  });
  const why = "隔离测试核对已验签事件与原收款，确保操作有审计且不重复发放";
  async function run(actor: string, input: any) {
    const op = await paymentOperation(actor, input);
    await processPaymentOperation(op.id);
    return getPaymentOperation(input.requestId);
  }
  const reconcile = (orderId: string) => ({
    requestId: randomUUID(),
    action: "RECONCILE_ORDER" as const,
    orderId,
    reason: why,
  });
  async function receiptCount(id: string) {
    return (
      await db
        .select()
        .from(paymentFulfillments)
        .where(eq(paymentFulfillments.orderId, id))
    ).length;
  }
  try {
    const admin = await user(true),
      member = await user();
    const one = await order();
    await saved(one);
    const input = {
      requestId: randomUUID(),
      action: "REPLAY_EVENT" as const,
      event: eventKey(one.event),
      reason: why,
    };
    await assert.rejects(
      () => paymentOperation(member, input),
      (e: any) => e.status === 403,
    );
    await assert.rejects(() =>
      paymentOperation(admin, { ...input, reason: "short" }),
    );
    const ops = await Promise.all(
      Array.from({ length: 8 }, () => paymentOperation(admin, input)),
    );
    assert.equal(new Set(ops.map((o) => o.id)).size, 1);
    await assert.rejects(
      () => paymentOperation(admin, { ...input, reason: why + " changed" }),
      (e: any) => e.status === 409,
    );
    await Promise.all(
      Array.from({ length: 8 }, () => processPaymentOperation(ops[0].id)),
    );
    assert.equal(
      (await getPaymentOperation(input.requestId)).status,
      "SUCCEEDED",
    );
    assert.equal(await receiptCount(one.o.id), 1);
    for (let i = 0; i < 5; i++)
      await run(admin, { ...input, requestId: randomUUID() });
    await run(admin, reconcile(one.o.id));
    assert.equal(await receiptCount(one.o.id), 1);
    assert.equal(
      (
        await db
          .select()
          .from(creditPackages)
          .where(eq(creditPackages.userId, one.uid))
      ).length,
      1,
    );
    pass(
      "Admin/current-role and reason guards; immutable UUID, concurrent request/lease and different-UUID replay/reconciliation issue one package and one receipt",
    );

    for (const provider of ["paypal", "waffo", "stripe", "creem"] as const) {
      const o = await order(provider);
      await saved(o, "PROCESSED");
      const op = await run(admin, reconcile(o.o.id));
      assert.equal(op.status, "SUCCEEDED");
      assert.equal(await receiptCount(o.o.id), 1);
      await run(admin, reconcile(o.o.id));
      assert.equal(await receiptCount(o.o.id), 1);
    }
    pass(
      "All four providers can repair a processed-but-unfulfilled saved paid fact through the original frozen snapshot without duplicate credits",
    );

    for (const provider of ["paypal", "stripe", "creem"] as const) {
      const o = await order(provider);
      if (provider === "paypal")
        queries.set(o.o.externalId, {
          id: o.o.externalId,
          status: "COMPLETED",
          purchase_units: [
            {
              custom_id: o.o.id,
              payee: { merchant_id: o.o.accountId },
              amount: { currency_code: "USD", value: "5.00" },
              payments: {
                captures: [
                  {
                    id: o.fact.paymentId,
                    status: "COMPLETED",
                    amount: { currency_code: "USD", value: "5.00" },
                  },
                ],
              },
            },
          ],
        });
      if (provider === "stripe")
        queries.set(o.o.externalId, {
          id: o.o.externalId,
          mode: "payment",
          payment_status: "paid",
          status: "complete",
          metadata: { orderId: o.o.id },
          client_reference_id: o.o.id,
          livemode: false,
          currency: "usd",
          amount_total: 500,
          payment_intent: {
            id: o.fact.paymentId,
            status: "succeeded",
            amount_received: 500,
            currency: "usd",
          },
        });
      if (provider === "creem")
        queries.set(o.o.externalId, {
          id: o.o.externalId,
          mode: "test",
          status: "completed",
          request_id: o.o.id,
          metadata: { orderId: o.o.id },
          product: "prod_AUD005",
          order: {
            id: o.fact.paymentId,
            mode: "test",
            status: "paid",
            amount: 500,
            amount_paid: 500,
            currency: "USD",
            product: "prod_AUD005",
          },
        });
      const op = await run(admin, reconcile(o.o.id));
      assert.equal(op.status, "SUCCEEDED", op.message!);
      assert.equal(await receiptCount(o.o.id), 1);
    }
    const unconfirmed = await order("paypal");
    queries.set(unconfirmed.o.externalId, {
      id: unconfirmed.o.externalId,
      status: "APPROVED",
      purchase_units: [
        {
          custom_id: unconfirmed.o.id,
          payee: { merchant_id: unconfirmed.o.accountId },
          amount: { currency_code: "USD", value: "5.00" },
        },
      ],
    });
    approved = true;
    const noCapture = await run(admin, reconcile(unconfirmed.o.id));
    approved = false;
    assert.equal(noCapture.status, "NEEDS_REVIEW");
    assert.equal(await receiptCount(unconfirmed.o.id), 0);
    assert(!http.some((s) => /capture|refund/.test(s)));
    pass(
      "Authoritative read-only PayPal/Stripe/Creem lookup can compensate missing callbacks; APPROVED PayPal is never captured and grants nothing",
    );

    const wa = await order("waffo");
    const noEvidence = await run(admin, reconcile(wa.o.id));
    assert.equal(noEvidence.status, "NEEDS_REVIEW");
    assert.equal(await receiptCount(wa.o.id), 0);
    await saved(wa);
    assert.equal((await run(admin, reconcile(wa.o.id))).status, "SUCCEEDED");
    const wrong = await order();
    wrong.event.fact.accountId = "wrong";
    await saved(wrong);
    assert.equal(
      (
        await run(admin, {
          ...input,
          requestId: randomUUID(),
          event: eventKey(wrong.event),
        })
      ).status,
      "NEEDS_REVIEW",
    );
    assert.equal(await receiptCount(wrong.o.id), 0);
    pass(
      "Waffo status/priceSnapshot alone cannot mint; a later preverified real-receipt fixture can recover once; mismatched fact scope is refused",
    );

    const dispute = await order();
    const reviewEvent = {
      ...dispute.event,
      id: "evt_dispute_" + randomUUID(),
      type: "dispute.created",
      fact: undefined,
    };
    await db
      .insert(paymentEvents)
      .values({
        provider: reviewEvent.provider,
        environment: reviewEvent.environment,
        accountId: reviewEvent.accountId,
        eventId: reviewEvent.id,
        eventType: reviewEvent.type,
        orderId: dispute.o.id,
        status: "IGNORED",
        normalizedEvent: reviewEvent,
      });
    assert.equal(
      (
        await run(admin, {
          ...input,
          requestId: randomUUID(),
          event: eventKey(reviewEvent),
        })
      ).status,
      "NEEDS_REVIEW",
    );
    await run(admin, {
      ...input,
      requestId: randomUUID(),
      action: "REVIEW_EVENT",
      event: eventKey(reviewEvent),
    });
    assert.equal(
      (
        await db
          .select()
          .from(paymentEvents)
          .where(eq(paymentEvents.eventId, reviewEvent.id))
      )[0].reviewStatus,
      "ACKNOWLEDGED",
    );
    assert.equal(await receiptCount(dispute.o.id), 0);
    pass(
      "Unrecognized/dispute/reversal events enter review; reasoned acknowledgment is audited and changes no money or credits",
    );

    const refunded = await order();
    await fulfillPayment(refunded.fact);
    const refundFact = {
      provider: refunded.fact.provider,
      environment: refunded.fact.environment,
      accountId: refunded.fact.accountId,
      paymentId: refunded.fact.paymentId,
      externalId: "RF" + randomUUID(),
      amount: 500,
      currency: "USD",
      status: "SUCCEEDED" as const,
    };
    const re = {
      ...refunded.event,
      id: "evt_refund_" + randomUUID(),
      type: "refund.succeeded",
      fact: undefined,
      refund: refundFact,
    };
    await db
      .insert(paymentEvents)
      .values({
        provider: re.provider,
        environment: re.environment,
        accountId: re.accountId,
        eventId: re.id,
        eventType: re.type,
        orderId: refunded.o.id,
        status: "VERIFIED",
        normalizedEvent: re,
      });
    for (let i = 0; i < 5; i++)
      await run(admin, {
        ...input,
        requestId: randomUUID(),
        event: eventKey(re),
      });
    const [r] = await db
      .select()
      .from(paymentRefunds)
      .where(eq(paymentRefunds.orderId, refunded.o.id));
    assert.equal(r.reclaimedCredits, 100);
    await run(admin, {
      requestId: randomUUID(),
      action: "RECHECK_REFUND",
      refundId: r.id,
      reason: why,
    });
    assert.equal(
      (
        await db
          .select()
          .from(paymentRefunds)
          .where(eq(paymentRefunds.orderId, refunded.o.id))
      ).length,
      1,
    );
    assert(!http.some((s) => /capture|refund/.test(s)));
    pass(
      "Refund-event replay and refund recheck never POST another cash refund; repeated operations reclaim only 100 original credits",
    );

    const rollback = await order();
    await saved(rollback);
    const t = "ops_" + randomUUID().replaceAll("-", "");
    await db.execute(
      sql.raw(
        `CREATE FUNCTION ${t}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id='${rollback.uid}' THEN RAISE EXCEPTION 'fixture financial rollback'; END IF; RETURN NEW; END $$`,
      ),
    );
    await db.execute(
      sql.raw(
        `CREATE TRIGGER ${t} BEFORE INSERT ON credit_transactions FOR EACH ROW EXECUTE FUNCTION ${t}()`,
      ),
    );
    try {
      const op = await run(admin, reconcile(rollback.o.id));
      assert.equal(op.status, "NEEDS_REVIEW");
      assert.equal(await receiptCount(rollback.o.id), 0);
      const [e] = await db
        .select()
        .from(paymentEvents)
        .where(eq(paymentEvents.eventId, rollback.event.id));
      assert(e.lastError);
      assert(e.attemptCount > 0);
    } finally {
      await db.execute(sql.raw(`DROP TRIGGER ${t} ON credit_transactions`));
      await db.execute(sql.raw(`DROP FUNCTION ${t}()`));
    }
    assert.equal(
      (await run(admin, reconcile(rollback.o.id))).status,
      "SUCCEEDED",
    );
    assert.equal(await receiptCount(rollback.o.id), 1);
    pass(
      "Financial rollback leaves a reasoned audit plus retriable event error/attempt metadata; subsequent evidence-backed compensation succeeds once",
    );

    const crash = await order();
    await saved(crash);
    const ci = reconcile(crash.o.id),
      co = await paymentOperation(admin, ci),
      ct = "opsfinal_" + randomUUID().replaceAll("-", "");
    await db.execute(
      sql.raw(
        `CREATE FUNCTION ${ct}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='${co.id}' AND NEW.status='SUCCEEDED' THEN RAISE EXCEPTION 'fixture finalize crash'; END IF; RETURN NEW; END $$`,
      ),
    );
    await db.execute(
      sql.raw(
        `CREATE TRIGGER ${ct} BEFORE UPDATE ON payment_operations FOR EACH ROW EXECUTE FUNCTION ${ct}()`,
      ),
    );
    try {
      await assert.rejects(() => processPaymentOperation(co.id));
      assert.equal(await receiptCount(crash.o.id), 1);
      assert.equal((await getPaymentOperation(ci.requestId)).status, "RUNNING");
    } finally {
      await db.execute(sql.raw(`DROP TRIGGER ${ct} ON payment_operations`));
      await db.execute(sql.raw(`DROP FUNCTION ${ct}()`));
    }
    await db
      .update(paymentOperations)
      .set({ leaseUntil: new Date(0) })
      .where(eq(paymentOperations.id, co.id));
    await processPaymentOperation(co.id);
    assert.equal((await getPaymentOperation(ci.requestId)).status, "SUCCEEDED");
    assert.equal(await receiptCount(crash.o.id), 1);
    const revoked = await user(true),
      rv = await order();
    await saved(rv);
    const rvo = await paymentOperation(revoked, reconcile(rv.o.id));
    await db.update(users).set({ disabled: true }).where(eq(users.id, revoked));
    await processPaymentOperation(rvo.id);
    assert.equal(await receiptCount(rv.o.id), 0);
    pass(
      "Audit intent is durable before side effects; finalization crash/expired lease recovery is idempotent; revoked queued actor cannot execute money operations",
    );
    const resumed = await order();
    await saved(resumed);
    const ri = reconcile(resumed.o.id),
      rop = await paymentOperation(admin, ri);
    execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `globalThis.fetch=async()=>{throw Error('No external HTTP in restart fixture')};const m=await import('./src/services/payment-operations.ts');await (m.default||m).processPaymentOperation(${JSON.stringify(rop.id)});const d=await import('./src/db/index.ts');await (d.default||d).db.$client.end({timeout:5});`,
      ],
      { env: process.env, stdio: "pipe" },
    );
    assert.equal((await getPaymentOperation(ri.requestId)).status, "SUCCEEDED");
    assert.equal(await receiptCount(resumed.o.id), 1);
    pass(
      "A separately started process resumes a durable queued audit intent and fulfills the preverified receipt once without provider HTTP",
    );
    process.env.STRIPE_SUB_BASIC_MONTHLY = "price_sub_AUD005";
    const { subscriptionCatalog } = await import(
      "../src/payment/billing-catalog"
    );
    const product = subscriptionCatalog.find(
      (p) => p.mapping === "SUB_BASIC_MONTHLY",
    )!;
    const su = await user(),
      so = await reserveOrder(su, {
        requestId: randomUUID(),
        provider: "stripe",
        productId: product.id,
      }),
      sext = "cs_test_" + randomUUID();
    await db
      .update(paymentOrders)
      .set({ externalId: sext, status: "PENDING" })
      .where(eq(paymentOrders.id, so.id));
    const start = new Date(Date.now() - 3600000).toISOString(),
      end = new Date(Date.now() + 86400000).toISOString();
    const sub = {
      id: "evt_sub_" + randomUUID(),
      type: "subscription.paid",
      provider: "stripe" as const,
      environment: "test",
      accountId: "acct_AUD005",
      subscription: {
        provider: "stripe" as const,
        environment: "test",
        accountId: "acct_AUD005",
        externalId: "sub_" + randomUUID(),
        customerId: "cus_" + randomUUID(),
        productId: "price_sub_AUD005",
        userId: su,
        checkoutOrderId: so.id,
        status: "active",
        cancelAtPeriodEnd: false,
        periodStart: start,
        periodEnd: end,
        observedAt: new Date().toISOString(),
        payment: {
          id: "in_" + randomUUID(),
          amount: product.amount,
          currency: "USD",
          periodStart: start,
          periodEnd: end,
        },
      },
    };
    await db
      .insert(paymentEvents)
      .values({
        provider: sub.provider,
        environment: sub.environment,
        accountId: sub.accountId,
        eventId: sub.id,
        eventType: sub.type,
        orderId: so.id,
        status: "VERIFIED",
        normalizedEvent: sub,
      });
    for (let i = 0; i < 4; i++)
      assert.equal(
        (
          await run(admin, {
            ...input,
            requestId: randomUUID(),
            event: eventKey(sub),
          })
        ).status,
        "SUCCEEDED",
      );
    await run(admin, reconcile(so.id));
    assert.equal(await receiptCount(so.id), 1);
    assert.equal(
      (
        await db
          .select()
          .from(creditPackages)
          .where(eq(creditPackages.userId, su))
      ).length,
      1,
    );
    const empty = await order();
    await db
      .update(paymentOrders)
      .set({ kind: "SUBSCRIPTION" })
      .where(eq(paymentOrders.id, empty.o.id));
    assert.equal(
      (await run(admin, reconcile(empty.o.id))).status,
      "NEEDS_REVIEW",
    );
    assert.equal(await receiptCount(empty.o.id), 0);
    pass(
      "Subscription replay retains the original paid-period ledger/expiry and grants once; missing paid-period evidence never becomes a manual credit grant",
    );
    const untouched = await order();
    await saved(untouched);
    const at = "opsaudit_" + randomUUID().replaceAll("-", "");
    await db.execute(
      sql.raw(
        `CREATE FUNCTION ${at}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.order_id='${untouched.o.id}' THEN RAISE EXCEPTION 'fixture audit insert failed'; END IF; RETURN NEW; END $$`,
      ),
    );
    await db.execute(
      sql.raw(
        `CREATE TRIGGER ${at} BEFORE INSERT ON payment_operations FOR EACH ROW EXECUTE FUNCTION ${at}()`,
      ),
    );
    try {
      await assert.rejects(() =>
        paymentOperation(admin, reconcile(untouched.o.id)),
      );
      assert.equal(await receiptCount(untouched.o.id), 0);
    } finally {
      await db.execute(sql.raw(`DROP TRIGGER ${at} ON payment_operations`));
      await db.execute(sql.raw(`DROP FUNCTION ${at}()`));
    }
    pass(
      "If durable audit insertion fails, no operation intent or financial side effect is created",
    );

    for (const view of ["orders", "events", "refunds", "operations"] as const) {
      const rows = await listPaymentOperations(
        paymentOpsQuerySchema.parse({
          view,
          q:
            view === "operations"
              ? ci.requestId
              : view === "refunds"
                ? refunded.o.id
                : view === "events"
                  ? one.event.id
                  : one.fact.paymentId,
          exceptions: "0",
        }),
      );
      assert(rows.rows.length > 0);
    }
    const none = await listPaymentOperations(
      paymentOpsQuerySchema.parse({ q: "%' OR 1=1 --", exceptions: "0" }),
    );
    assert.equal(none.rows.length, 0);
    const filtered = await listPaymentOperations(
      paymentOpsQuerySchema.parse({
        view: "orders",
        provider: "stripe",
        exceptions: "0",
      }),
    );
    assert(filtered.rows.every((r) => r.provider === "stripe"));
    const page1 = await listPaymentOperations(
        paymentOpsQuerySchema.parse({
          view: "orders",
          q: "AUD005-",
          exceptions: "0",
          page: 1,
        }),
      ),
      page2 = await listPaymentOperations(
        paymentOpsQuerySchema.parse({
          view: "orders",
          q: "AUD005-",
          exceptions: "0",
          page: 2,
        }),
      );
    assert.equal(page1.rows.length, 15);
    assert(page1.hasNext);
    assert(page2.rows.length > 0);
    assert(!page1.rows.some((a) => page2.rows.some((b) => a.id === b.id)));
    pass(
      "Order/user/receipt/event/refund/audit search, provider filtering and bound SQL search do not expose arbitrary payloads or bypass query scope",
    );
    if (process.argv.includes("--browser")) {
      const ui = await order();
      await saved(ui);
      writeFileSync(
        ".local/aud005-browser-fixtures.json",
        JSON.stringify({
          orderId: ui.o.id,
          eventId: ui.event.id,
          provider: ui.event.provider,
          environment: ui.event.environment,
          accountId: ui.event.accountId,
        }),
      );
      execFileSync(
        process.execPath,
        ["scripts/test-payment-operations-browser.mjs"],
        { stdio: "inherit" },
      );
      assert.equal(await receiptCount(ui.o.id), 1);
    }
    writeFileSync(
      "docs/project-state/aud-005-operations-results.json",
      JSON.stringify(
        {
          at: new Date().toISOString(),
          passed,
          providerHttp: http.map((s) =>
            s.replace(/\/[^/]*$/, "/[redacted-object]"),
          ),
          newRealProviderCalls: 0,
          fixtures:
            "Isolated preverified normalization/receipt fixtures, not real platform acceptance",
        },
        null,
        2,
      ),
    );
  } finally {
    globalThis.fetch = original;
    for (const uid of ids.slice().reverse()) {
      const orders = (
        await db
          .select({ id: paymentOrders.id })
          .from(paymentOrders)
          .where(eq(paymentOrders.userId, uid))
      ).map((o) => o.id);
      await db.delete(paymentOperations).where(orCondition(uid, orders));
      await db
        .delete(billingCycles)
        .where(inArray(billingCycles.orderId, orders));
      await db
        .delete(billingSubscriptions)
        .where(eq(billingSubscriptions.userId, uid));
      await db
        .delete(paymentFulfillments)
        .where(inArray(paymentFulfillments.orderId, orders));
      await db
        .delete(creditTransactions)
        .where(eq(creditTransactions.userId, uid));
      await db
        .delete(paymentEvents)
        .where(inArray(paymentEvents.orderId, orders));
      await db
        .delete(paymentRefundReviews)
        .where(inArray(paymentRefundReviews.orderId, orders));
      await db
        .delete(paymentRefunds)
        .where(inArray(paymentRefunds.orderId, orders));
      await db.delete(creditPackages).where(eq(creditPackages.userId, uid));
      await db.delete(paymentOrders).where(eq(paymentOrders.userId, uid));
      await db.delete(users).where(eq(users.id, uid));
    }
    await db.$client.end({ timeout: 5 });
  }
  function orCondition(uid: string, orders: string[]) {
    return sql`${paymentOperations.actorUserId}=${uid} or ${inArray(paymentOperations.orderId, orders)}`;
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
