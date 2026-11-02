import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55432");
  assert.equal(url.pathname, "/laconic_local");
  for (const name of ["text", "video", "payment"])
    if (existsSync(`.local/${name}-worker.pid`)) {
      let alive = false;
      try {
        process.kill(
          Number(readFileSync(`.local/${name}-worker.pid`, "utf8")),
          0,
        );
        alive = true;
      } catch {}
      assert(!alive, `Stop ${name} worker first`);
    }
  Object.assign(process.env, {
    STRIPE_ENABLED: "true",
    STRIPE_ENVIRONMENT: "test",
    STRIPE_API_KEY: "sk_test_refund_fixture",
    STRIPE_ACCOUNT_ID: "acct_refund_fixture",
    STRIPE_WEBHOOK_SECRET: "whsec_refund_fixture",
    STRIPE_PRICE_STARTER: "price_refund_fixture",
    CREEM_ENABLED: "true",
    CREEM_ENVIRONMENT: "test",
    CREEM_API_KEY: "creem_test_refund_fixture",
    CREEM_ACCOUNT_SCOPE: "refund_fixture",
    CREEM_WEBHOOK_SECRET: "creem_refund_fixture",
    CREEM_PRODUCT_STARTER: "prod_refund_fixture",
  });
  const {
    db,
    users,
    paymentOrders,
    paymentFulfillments,
    paymentEvents,
    paymentRefunds,
    paymentRefundReviews,
    creditPackages,
    creditTransactions,
    tasks,
    creditHolds,
    taskAttempts,
  } = await import("../src/db");
  const { eq, inArray, sql } = await import("drizzle-orm");
  const {
    reserveOrder,
    fulfillPayment,
    receivePaymentEvent,
    recoverPaymentEvent,
  } = await import("../src/services/orders");
  const {
    createRefund,
    processRefund,
    receiveRefundFact,
    recheckRefund,
    refundView,
    waiveRefundLoss,
  } = await import("../src/services/refunds");
  const { reserveToolTask, finishTask } = await import("../src/services/tasks");
  const { verifyStripe } = await import("../src/payment/providers/stripe");
  const { verifyCreem } = await import("../src/payment/providers/creem");
  const { getStripe } = await import("../src/payment");
  const stripe = getStripe() as any;
  const ids: string[] = [];
  const passed: string[] = [];
  const receipts = new Map<string, any>();
  const intents = new Map<string, any>();
  const txs = new Map<string, any>();
  const invoices = new Map<string, string>();
  const originalFetch = globalThis.fetch;
  let stripeCreates = 0;
  let creemCreates = 0;
  let lose = false;
  let state = "succeeded";
  let callbackRace: (() => Promise<void>) | undefined;
  const pass = (s: string) => {
    passed.push(s);
    console.log("PASS " + s);
  };
  // Unknown SDK/HTTP requests fail closed. No fixture can call a real provider.
  stripe._requestSender._request = () => {
    throw Error("Unexpected Stripe network in refund fixture");
  };
  stripe.rawRequest = async (_m: string, path: string) => {
    assert.equal(path, "/v1/account");
    return { id: "acct_refund_fixture" };
  };
  stripe.paymentIntents.retrieve = async (id: string) =>
    structuredClone(intents.get(id));
  stripe.invoicePayments.list = async (params: any) => ({
    has_more: false,
    data: [...invoices]
      .filter(([invoice, pi]) =>
        params.invoice
          ? params.invoice === invoice
          : params.payment?.payment_intent === pi,
      )
      .map(([invoice, pi]) => ({
        invoice,
        status: "paid",
        payment: { type: "payment_intent", payment_intent: pi },
      })),
  });
  stripe.refunds.create = async (params: any, opts: any) => {
    stripeCreates++;
    assert.equal(opts.idempotencyKey, `refund-${params.metadata.refundId}`);
    const r = {
      id: "re_" + randomUUID().replaceAll("-", ""),
      amount: params.amount,
      currency: "usd",
      payment_intent: params.payment_intent,
      metadata: params.metadata,
      status: state,
    };
    receipts.set(r.id, r);
    if (callbackRace) await callbackRace();
    if (lose) throw Error("Lost Stripe refund response");
    return structuredClone(r);
  };
  stripe.refunds.retrieve = async (id: string) =>
    structuredClone(receipts.get(id));
  stripe.refunds.list = async (params: any) => ({
    has_more: false,
    data: [...receipts.values()].filter(
      (r) => r.payment_intent === params.payment_intent,
    ),
  });
  globalThis.fetch = async (input, init: any = {}) => {
    const u = new URL(String(input));
    assert.equal(u.origin, "https://test-api.creem.io");
    if (u.pathname === "/v1/transactions")
      return Response.json(txs.get(u.searchParams.get("transaction_id")!));
    if (u.pathname === "/v1/transactions/search")
      return Response.json({
        items: [...txs.values()].filter(
          (t) => t.order === u.searchParams.get("order_id"),
        ),
        pagination: { total_records: 1, total_pages: 1 },
      });
    if (u.pathname === "/v1/refunds" && init.method === "POST") {
      creemCreates++;
      const b = JSON.parse(init.body);
      assert.deepEqual(Object.keys(b), ["transaction_id"]);
      const tx = txs.get(b.transaction_id);
      assert(tx);
      if (state === "succeeded") {
        tx.status = "refunded";
        tx.refunded_amount = tx.amount_paid;
      }
      if (callbackRace) await callbackRace();
      if (lose) throw Error("Lost Creem refund response");
      return Response.json({ status: state });
    }
    throw Error("Unexpected Creem endpoint");
  };
  async function user(admin = false) {
    const id = randomUUID();
    ids.push(id);
    await db.insert(users).values({
      id,
      email: `refund4-${id}@example.invalid`,
      name: "Isolated four-channel refund",
      emailVerified: true,
      isAdmin: admin,
    });
    return id;
  }
  async function paid(
    provider: "stripe" | "creem",
    invoice = false,
    legacyOrder = false,
  ) {
    const uid = await user();
    const order = await reserveOrder(uid, {
        requestId: randomUUID(),
        provider,
        productId: "starter",
      });
    const unique = randomUUID().replaceAll("-", "");
    const pi = "pi_" + unique;
    const txid = "tran_" + unique;
    const ord = "ord_" + unique;
    const paymentId =
      provider === "stripe"
        ? invoice
          ? "in_" + unique
          : pi
        : legacyOrder
          ? ord
          : txid;
    if (invoice) invoices.set(paymentId, pi);
    intents.set(pi, {
      id: pi,
      status: "succeeded",
      livemode: false,
      currency: "usd",
      amount_received: 500,
    });
    txs.set(txid, {
      id: txid,
      mode: "test",
      amount: 500,
      amount_paid: 500,
      currency: "USD",
      type: "payment",
      status: "paid",
      refunded_amount: 0,
      order: ord,
    });
    const externalId =
      provider === "stripe" ? "cs_test_" + unique : "ch_" + unique;
    await db
      .update(paymentOrders)
      .set({ externalId, status: "PENDING" })
      .where(eq(paymentOrders.id, order.id));
    await fulfillPayment({
      ...order,
      provider,
      internalId: order.id,
      externalId,
      paymentId,
    });
    return { ...order, uid, paymentId, pi, txid, ord };
  }
  const request = (orderId: string, amount = 500) => ({
    requestId: randomUUID(),
    orderId,
    amount,
    reason: "隔离测试退款，验证来源积分回收和重复通知",
  });
  async function event(
    o: Awaited<ReturnType<typeof paid>>,
    eid = "evt_" + randomUUID(),
  ) {
    if (o.provider === "stripe") {
      const ref = [...receipts.values()].find((r) => r.payment_intent === o.pi);
      assert(ref);
      const raw = JSON.stringify({
        id: eid,
        type: "refund.updated",
        created: Math.floor(Date.now() / 1000),
        livemode: false,
        data: { object: { id: ref.id } },
      });
      const signature = stripe.webhooks.generateTestHeaderString({
        payload: raw,
        secret: process.env.STRIPE_WEBHOOK_SECRET,
      });
      return verifyStripe(
        new Request("http://localhost", {
          headers: { "stripe-signature": signature },
        }),
        raw,
      );
    }
    const tx = txs.get(o.txid);
    const raw = JSON.stringify({
      id: eid,
      eventType: "refund.created",
      created_at: Date.now(),
      object: {
        id: "ref_" + o.txid,
        mode: "test",
        status: "succeeded",
        refund_amount: 500,
        refund_currency: "USD",
        transaction: tx,
      },
    });
    return verifyCreem(
      new Request("http://localhost", {
        headers: {
          "creem-signature": createHmac(
            "sha256",
            process.env.CREEM_WEBHOOK_SECRET!,
          )
            .update(raw)
            .digest("hex"),
        },
      }),
      raw,
    );
  }
  function externalSuccess(
    o: Awaited<ReturnType<typeof paid>>,
    reference?: string,
  ) {
    if (o.provider === "stripe") {
      const r = {
        id: "re_" + randomUUID().replaceAll("-", ""),
        amount: 500,
        currency: "usd",
        payment_intent: o.pi,
        metadata: reference ? { refundId: reference } : {},
        status: "succeeded",
      };
      receipts.set(r.id, r);
    } else {
      const t = txs.get(o.txid);
      t.status = "refunded";
      t.refunded_amount = 500;
    }
  }
  const due = async (id: string) =>
    db
      .update(paymentRefunds)
      .set({ nextCheckAt: new Date(0) })
      .where(eq(paymentRefunds.id, id));
  const reserve = (uid: string, credits = 30) =>
    reserveToolTask(uid, randomUUID(), {}, "refund-fixture", () => ({
      provider: "fixture",
      model: "fixture",
      credits,
      executionConfig: {},
    }));
  try {
    const actor = await user(true);
    const member = await user();
    for (const provider of ["stripe", "creem"] as const) {
      const o = await paid(provider);
      const input = request(o.id);
      await assert.rejects(
        () => createRefund(member, input),
        (e: any) => e.status === 403,
      );
      const refs = await Promise.all(
        Array.from({ length: 8 }, () => createRefund(actor, input)),
      );
      assert.equal(new Set(refs.map((r) => r.id)).size, 1);
      assert.equal((await refundView(o.id)).pkg!.remainingCredits, 0);
      await assert.rejects(() =>
        createRefund(actor, { ...input, amount: 499 }),
      );
      await Promise.all(
        Array.from({ length: 8 }, () => processRefund(refs[0].id)),
      );
      assert.equal(provider === "stripe" ? stripeCreates : creemCreates, 1);
      const e = await event(o);
      await Promise.all(
        Array.from({ length: 8 }, () => receivePaymentEvent(e)),
      );
      await receivePaymentEvent({ ...e, id: "evt_different_" + randomUUID() });
      const v = await refundView(o.id);
      assert.equal(v.refunds.length, 1);
      assert.equal(v.order.refundedAmount, 500);
      assert.equal(v.pkg!.refundReclaimedCredits, 100);
      assert.equal(v.pkg!.refundReservedCredits, 0);
      assert.equal(
        (
          await db
            .select()
            .from(creditTransactions)
            .where(eq(creditTransactions.refundId, refs[0].id))
        ).length,
        2,
      );
      await assert.rejects(
        () => receivePaymentEvent({ ...e, fingerprint: "changed" }),
        /内容不可更改/,
      );
      await receiveRefundFact({ ...e.refund!, status: "FAILED" });
      assert.equal((await refundView(o.id)).refunds[0].status, "SUCCEEDED");
      pass(
        `${provider}: administrator authorization, UUID immutability, 8 concurrent requests/worker calls, signed duplicate/different-event callbacks and terminal ordering reclaim once`,
      );

      const lost = await paid(provider);
      lose = true;
      const lr = await createRefund(actor, request(lost.id));
      await processRefund(lr.id);
      assert.equal((await refundView(lost.id)).refunds[0].status, "REVIEW");
      const calls = provider === "stripe" ? stripeCreates : creemCreates;
      lose = false;
      await recheckRefund(actor, lr.id);
      assert.equal(
        (await refundView(lost.id)).pkg!.refundReclaimedCredits,
        100,
      );
      assert.equal(provider === "stripe" ? stripeCreates : creemCreates, calls);
      pass(
        `${provider}: lost submission response retains source hold; query-only reconciliation succeeds without a second cash request`,
      );

      const waiting = await paid(provider);
      state = "pending";
      const wr = await createRefund(actor, request(waiting.id));
      await processRefund(wr.id);
      assert.equal((await refundView(waiting.id)).refunds[0].status, "PENDING");
      externalSuccess(waiting);
      if (provider === "stripe") {
        const r = [...receipts.values()].find(
          (r) => r.payment_intent === waiting.pi,
        );
        r.status = "succeeded";
      }
      await due(wr.id);
      await processRefund(wr.id);
      await receivePaymentEvent(await event(waiting));
      assert.equal(
        (await refundView(waiting.id)).pkg!.refundReclaimedCredits,
        100,
      );
      state = "failed";
      const failure = await paid(provider);
      const fr = await createRefund(actor, request(failure.id));
      await processRefund(fr.id);
      const fv = await refundView(failure.id);
      assert.equal(fv.refunds[0].status, "FAILED");
      assert.equal(fv.pkg!.remainingCredits, 100);
      assert.equal(fv.pkg!.refundReservedCredits, 0);
      state = "succeeded";
      const retry = await createRefund(actor, request(failure.id));
      await processRefund(retry.id);
      const retried = await refundView(failure.id);
      assert.equal(retried.pkg!.refundReservedCredits, 0);
      assert.equal(retried.pkg!.refundReclaimedCredits, 100);
      assert.equal(
        retried.refunds.filter((r) => r.status === "SUCCEEDED").length,
        1,
      );
      pass(
        `${provider}: asynchronous pending completion and explicit cash failure release/settle the source hold once`,
      );

      const frozen = await paid(provider);
      const task = await reserve(frozen.uid);
      const countBefore = provider === "stripe" ? stripeCreates : creemCreates;
      const blocked = await createRefund(actor, request(frozen.id));
      assert.equal(blocked.status, "BLOCKED");
      await processRefund(blocked.id);
      assert.equal(
        provider === "stripe" ? stripeCreates : creemCreates,
        countBefore,
      );
      const [other] = await db
        .insert(creditPackages)
        .values({
          userId: frozen.uid,
          orderNo: "other-" + randomUUID(),
          transType: "SYSTEM_ADJUST",
          initialCredits: 20,
          remainingCredits: 20,
          status: "ACTIVE",
          expiredAt: new Date(Date.now() + 86400000),
        })
        .returning();
      externalSuccess(frozen);
      const ex = await event(frozen);
      await Promise.all(
        Array.from({ length: 8 }, () => receivePaymentEvent(ex)),
      );
      assert.equal(
        (await refundView(frozen.id)).order.refundCreditShortfall,
        30,
      );
      await assert.rejects(() => reserve(frozen.uid), /退款积分尚待审核/);
      await finishTask(task.id, null, {
        errorCode: "FIXTURE",
        errorMessage: "isolated failure",
      });
      const after = await refundView(frozen.id);
      assert.equal(after.pkg!.refundReclaimedCredits, 100);
      assert.equal(after.order.refundCreditShortfall, 0);
      assert.equal(
        (
          await db
            .select()
            .from(creditPackages)
            .where(eq(creditPackages.id, other.id))
        )[0].remainingCredits,
        20,
      );

      const consumed = await paid(provider);
      const ct = await reserve(consumed.uid, 40);
      await db
        .update(tasks)
        .set({ status: "RUNNING" })
        .where(eq(tasks.id, ct.id));
      await finishTask(ct.id, null, { result: "isolated success" });
      assert.equal(
        (await createRefund(actor, request(consumed.id))).status,
        "BLOCKED",
      );
      externalSuccess(consumed);
      await receivePaymentEvent(await event(consumed));
      assert.equal(
        (await refundView(consumed.id)).order.refundCreditShortfall,
        40,
      );
      const review = {
        requestId: randomUUID(),
        orderId: consumed.id,
        reason: "确认已消费来源积分差额由商户承担并保留审核记录",
        acknowledgeLoss: true as const,
      };
      await waiveRefundLoss(actor, review);
      await waiveRefundLoss(actor, review);
      assert.equal(
        (await refundView(consumed.id)).order.refundCreditsWaived,
        40,
      );
      const running = await paid(provider);
      const rt = await reserve(running.uid, 20);
      await db
        .update(tasks)
        .set({ status: "RUNNING" })
        .where(eq(tasks.id, rt.id));
      externalSuccess(running);
      await receivePaymentEvent(await event(running));
      await finishTask(rt.id, null, {
        result: "existing running task may complete",
      });
      const rv = await refundView(running.id);
      assert.equal(rv.pkg!.frozenCredits, 0);
      assert.equal(rv.pkg!.remainingCredits, 0);
      assert.equal(rv.order.refundCreditShortfall, 20);
      const expired = await paid(provider);
      const ep = await refundView(expired.id);
      await db
        .update(creditPackages)
        .set({ expiredAt: new Date(Date.now() - 1000) })
        .where(eq(creditPackages.id, ep.pkg!.id));
      assert.equal(
        (await createRefund(actor, request(expired.id))).status,
        "BLOCKED",
      );
      pass(
        `${provider}: frozen/consumed blocks before HTTP; external cash refund reclaims only source, gates new tasks, failed-task release pays debt; audited waiver is idempotent`,
      );

      const rollback = await paid(provider);
      const rr = await createRefund(actor, request(rollback.id));
      externalSuccess(rollback, rr.id);
      const rev = await event(rollback);
      const trigger = "refund4_" + randomUUID().replaceAll("-", "");
      await db.execute(
        sql.raw(
          `CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.refund_id = '${rr.id}' AND NEW.trans_type = 'REFUND_RECLAIM' THEN RAISE EXCEPTION 'fixture rollback'; END IF; RETURN NEW; END $$`,
        ),
      );
      await db.execute(
        sql.raw(
          `CREATE TRIGGER ${trigger} BEFORE INSERT ON credit_transactions FOR EACH ROW EXECUTE FUNCTION ${trigger}()`,
        ),
      );
      try {
        await assert.rejects(() => receivePaymentEvent(rev));
        const v = await refundView(rollback.id);
        assert.equal(v.order.refundedAmount, 0);
        assert.equal(v.pkg!.refundReservedCredits, 100);
      } finally {
        await db.execute(
          sql.raw(`DROP TRIGGER ${trigger} ON credit_transactions`),
        );
        await db.execute(sql.raw(`DROP FUNCTION ${trigger}()`));
      }
      await recoverPaymentEvent();
      await receivePaymentEvent(rev);
      assert.equal(
        (await refundView(rollback.id)).pkg!.refundReclaimedCredits,
        100,
      );
      pass(
        `${provider}: transaction failure rolls back cash projection/package/ledger; saved verified event recovers exactly once`,
      );
    }
    const partial = await paid("stripe");
    for (const amount of [1, 1, 498]) {
      const r = await createRefund(actor, request(partial.id, amount));
      await processRefund(r.id);
    }
    assert.equal(
      (await refundView(partial.id)).pkg!.refundReclaimedCredits,
      100,
    );
    const invoice = await paid("stripe", true);
    const ir = await createRefund(actor, request(invoice.id));
    await processRefund(ir.id);
    await receivePaymentEvent(await event(invoice));
    assert.equal(
      (await refundView(invoice.id)).pkg!.refundReclaimedCredits,
      100,
    );
    pass(
      "Stripe: cumulative partial rounding/full refund and subscription invoice-to-PaymentIntent refund association",
    );

    const full = await paid("creem", false, true);
    await assert.rejects(
      () => createRefund(actor, request(full.id, 250)),
      /整笔退款/,
    );
    const cr = await createRefund(actor, request(full.id));
    callbackRace = async () => {
      await receivePaymentEvent(await event(full));
    };
    await processRefund(cr.id);
    callbackRace = undefined;
    const cv = await refundView(full.id);
    assert.equal(cv.refunds.length, 1);
    assert.equal(cv.pkg!.refundReclaimedCredits, 100);
    pass(
      "Creem: legacy order ID resolves one transaction; partial request rejected; callback arriving before POST response binds same full-refund identity",
    );

    const tax = await paid("creem");
    txs.get(tax.txid).amount_paid = 550;
    const calls = creemCreates;
    const tr = await createRefund(actor, request(tax.id));
    await processRefund(tr.id);
    assert.equal(creemCreates, calls);
    assert.equal((await refundView(tax.id)).refunds[0].status, "REVIEW");
    const scoped = await paid("stripe");
    const sr = await createRefund(actor, request(scoped.id));
    process.env.STRIPE_ACCOUNT_ID = "acct_changed";
    await processRefund(sr.id);
    process.env.STRIPE_ACCOUNT_ID = "acct_refund_fixture";
    assert.equal((await refundView(scoped.id)).refunds[0].status, "REVIEW");
    for (const provider of ["stripe", "creem"] as const) {
      const o = await paid(provider);
      externalSuccess(o);
      const e = await event(o);
      await assert.rejects(() =>
        receivePaymentEvent({
          ...e,
          id: "evt_bad_" + randomUUID(),
          refund: { ...e.refund!, amount: 501, currency: "EUR" },
        }),
      );
      await assert.rejects(() =>
        receiveRefundFact({ ...e.refund!, accountId: "wrong" }),
      );
      assert.equal((await refundView(o.id)).pkg!.remainingCredits, 100);
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
          headers: { "creem-signature": "bad" },
        }),
        "{}",
      ),
    );
    pass(
      "Guards: changed account, tax-inclusive/ambiguous Creem transaction, wrong currency/account/amount and forged signatures never reclaim or send another refund",
    );

    if (process.argv.includes("--browser")) {
      const stripeUi = await paid("stripe");
      const creemUi = await paid("creem");
      writeFileSync(
        ".local/refund-browser-fixtures.json",
        JSON.stringify({
          stripe: stripeUi.id,
          creem: creemUi.id,
          pending: scoped.id,
          done: invoice.id,
        }),
      );
      execFileSync(process.execPath, ["scripts/test-refund-browser.mjs"], {
        stdio: "inherit",
        env: {
          ...process.env,
          STRIPE_ENABLED: "false",
          CREEM_ENABLED: "false",
        },
      });
    }
    writeFileSync(
      "docs/project-state/four-channel-refund-results.json",
      JSON.stringify(
        {
          at: new Date().toISOString(),
          passed,
          realProviderCalls: 0,
          fixtureDataCleaned: true,
          realAcceptance: "Deferred by Owner until HTTPS deployment",
        },
        null,
        2,
      ),
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const uid of ids.slice().reverse()) {
      const orderIds = (
        await db
          .select({ id: paymentOrders.id })
          .from(paymentOrders)
          .where(eq(paymentOrders.userId, uid))
      ).map((o) => o.id);
      await db
        .delete(paymentFulfillments)
        .where(inArray(paymentFulfillments.orderId, orderIds));
      await db
        .delete(creditTransactions)
        .where(eq(creditTransactions.userId, uid));
      await db
        .delete(taskAttempts)
        .where(
          inArray(
            taskAttempts.taskId,
            db
              .select({ id: tasks.id })
              .from(tasks)
              .where(eq(tasks.userId, uid)),
          ),
        );
      await db.delete(creditHolds).where(eq(creditHolds.userId, uid));
      await db.delete(tasks).where(eq(tasks.userId, uid));
      await db
        .delete(paymentEvents)
        .where(inArray(paymentEvents.orderId, orderIds));
      await db
        .delete(paymentRefundReviews)
        .where(inArray(paymentRefundReviews.orderId, orderIds));
      await db
        .delete(paymentRefunds)
        .where(inArray(paymentRefunds.orderId, orderIds));
      await db.delete(creditPackages).where(eq(creditPackages.userId, uid));
      await db.delete(paymentOrders).where(eq(paymentOrders.userId, uid));
      await db.delete(users).where(eq(users.id, uid));
    }
    await db.$client.end({ timeout: 5 });
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
