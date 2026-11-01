import assert from "node:assert/strict";
import { randomUUID, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55432");
  assert.equal(url.pathname, "/laconic_local");
  for (const name of ["payment", "text", "video"]) {
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
  }
  const keys = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  Object.assign(process.env, {
    PAYPAL_ENABLED: "true",
    PAYPAL_ENVIRONMENT: "sandbox",
    PAYPAL_CLIENT_ID: "fixture",
    PAYPAL_CLIENT_SECRET: "fixture",
    PAYPAL_MERCHANT_ID: "TESTMERCHANT",
    PAYPAL_WEBHOOK_ID: "WH-FIXTURE",
    WAFFO_ENABLED: "true",
    WAFFO_ENVIRONMENT: "test",
    WAFFO_MERCHANT_ID: "MER_fixture",
    WAFFO_STORE_ID: "STO_fixture",
    WAFFO_PRIVATE_KEY: keys.privateKey,
    WAFFO_WEBHOOK_PUBLIC_KEY: keys.publicKey,
    WAFFO_PRODUCT_STARTER: "PROD_fixture",
    WAFFO_PRODUCT_STANDARD: "PROD_fixture_standard",
    PAYMENT_RETURN_BASE_URL: "https://fixture.example.com",
    WAFFO_RETURN_BASE_URL: "https://fixture.example.com",
  });
  const {
    db,
    users,
    paymentOrders,
    paymentEvents,
    paymentFulfillments,
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
    receiveRefundFact,
    refundView,
    processRefund,
    recheckRefund,
    waiveRefundLoss,
  } = await import("../src/services/refunds");
  const { reserveToolTask, finishTask } = await import("../src/services/tasks");
  const { verifyWaffo } = await import("../src/payment/providers/waffo");
  const { refundCreditTarget } = await import("../src/payment/refund-policy");
  const ids: string[] = [];
  let creates = 0;
  let lose = false;
  const receipts = new Map<string, any>();
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input));
    if (u.pathname === "/v1/oauth2/token")
      return Response.json({ access_token: "fixture" });
    if (u.pathname === "/v1/notifications/verify-webhook-signature")
      return Response.json({ verification_status: "SUCCESS" });
    if (u.pathname.endsWith("/refund") && init?.method === "POST") {
      creates++;
      const b = JSON.parse(String(init.body));
      const r = {
        id: `REFUND${creates}`,
        status: "COMPLETED",
        amount: b.amount,
        invoice_id: b.invoice_id,
        links: [
          {
            rel: "up",
            href: `https://api-m.sandbox.paypal.com${u.pathname.slice(0, -7)}`,
          },
        ],
      };
      receipts.set(r.id, r);
      if (lose) throw Error("fixture network lost");
      return Response.json(r);
    }
    const ref = u.pathname.split("/").pop()!;
    if (receipts.has(ref)) return Response.json(receipts.get(ref));
    throw Error(`Unexpected fixture HTTP ${u.pathname}`);
  };
  async function user(admin = false) {
    const id = randomUUID();
    ids.push(id);
    await db.insert(users).values({
      id,
      name: "Refund isolated fixture",
      email: `refund-${id}@example.invalid`,
      emailVerified: true,
      isAdmin: admin,
    });
    return id;
  }
  async function paid(provider: "paypal" | "waffo" = "paypal") {
    const uid = await user();
    const o = await reserveOrder(uid, {
      requestId: randomUUID(),
      provider,
      productId: "starter",
    });
    const externalId = `ORDER${randomUUID().replaceAll("-", "")}`;
    const paymentId = `PAY${randomUUID().replaceAll("-", "").toUpperCase()}`;
    await db
      .update(paymentOrders)
      .set({ externalId, status: "PENDING" })
      .where(eq(paymentOrders.id, o.id));
    await fulfillPayment({
      ...o,
      internalId: o.id,
      provider,
      externalId,
      paymentId,
    });
    return {
      uid,
      id: o.id,
      paymentId,
      provider,
      environment: o.environment,
      accountId: o.accountId,
    };
  }
  const request = (orderId: string, amount = 500) => ({
    requestId: randomUUID(),
    orderId,
    amount,
    reason: "隔离测试退款原因，验证只回收来源积分",
  });
  const fact = (
    o: Awaited<ReturnType<typeof paid>>,
    r?: { id: string; amount: number },
    status: "SUCCEEDED" | "FAILED" | "PENDING" = "SUCCEEDED",
  ) => ({
    provider: o.provider,
    environment: o.environment,
    accountId: o.accountId,
    paymentId: o.paymentId,
    externalId: r ? `REF${r.id}` : `EX${o.id}`,
    reference: r?.id,
    amount: r?.amount ?? 500,
    currency: "USD",
    status,
  });
  try {
    const actor = await user(true);
    const o = await paid();
    const input = request(o.id, 1);
    const rs = await Promise.all(
      Array.from({ length: 8 }, () => createRefund(actor, input)),
    );
    assert.equal(new Set(rs.map((r) => r.id)).size, 1);
    assert.equal((await refundView(o.id)).pkg!.remainingCredits, 99);
    await assert.rejects(() => createRefund(actor, { ...input, amount: 2 }));
    await Promise.all(Array.from({ length: 8 }, () => processRefund(rs[0].id)));
    assert.equal(creates, 1);
    let v = await refundView(o.id);
    assert.equal(v.order.refundedAmount, 1);
    assert.equal(v.pkg!.refundReclaimedCredits, 1);
    const done = v.refunds[0];
    await Promise.all(
      Array.from({ length: 5 }, () =>
        receiveRefundFact({ ...fact(o, done), externalId: done.externalId! }),
      ),
    );
    await receiveRefundFact({
      ...fact(o, done, "FAILED"),
      externalId: done.externalId!,
    });
    assert.equal((await refundView(o.id)).order.refundedAmount, 1);
    const next = await createRefund(actor, request(o.id, 1));
    await receiveRefundFact(fact(o, next));
    v = await refundView(o.id);
    assert.equal(v.pkg!.refundReclaimedCredits, 1);
    assert.equal(v.pkg!.remainingCredits, 99);
    const full = await createRefund(actor, request(o.id, 498));
    await receiveRefundFact(fact(o, full));
    assert.equal((await refundView(o.id)).pkg!.refundReclaimedCredits, 100);
    for (let n = 0; n <= 500; n++)
      assert.equal(refundCreditTarget(100, n, 500), Math.ceil((100 * n) / 500));
    console.log(
      "PASS concurrent request/cash submission, immutable UUID, duplicate and late failure, cumulative partial rounding/full refund.",
    );
    const f = await paid();
    const fr = await createRefund(actor, request(f.id));
    await receiveRefundFact(fact(f, fr, "PENDING"));
    assert.equal((await refundView(f.id)).pkg!.refundReclaimedCredits, 0);
    const expiredAt = new Date(Date.now() - 60000);
    await db
      .update(creditPackages)
      .set({ expiredAt })
      .where(eq(creditPackages.id, (await refundView(f.id)).pkg!.id));
    await receiveRefundFact(fact(f, fr, "FAILED"));
    await receiveRefundFact(fact(f, fr, "FAILED"));
    v = await refundView(f.id);
    assert.equal(v.pkg!.remainingCredits, 100);
    assert.equal(v.pkg!.refundReservedCredits, 0);
    assert.equal(v.pkg!.expiredAt!.getTime(), expiredAt.getTime());
    assert.equal(
      (
        await db
          .select()
          .from(creditTransactions)
          .where(eq(creditTransactions.refundId, fr.id))
      ).find((r) => r.transType === "REFUND_RELEASE")!.credits,
      0,
    );
    const lost = await paid();
    const lr = await createRefund(actor, request(lost.id));
    lose = true;
    await processRefund(lr.id);
    lose = false;
    v = await refundView(lost.id);
    assert.equal(v.refunds[0].status, "REVIEW");
    const before = creates;
    await processRefund(lr.id);
    assert.equal(creates, before);
    await recheckRefund(actor, lr.id, `REFUND${creates}`);
    assert.equal((await refundView(lost.id)).order.refundedAmount, 500);
    console.log(
      "PASS pending/failure release once, lost submission receipt keeps reservation, query-only recovery without second cash POST.",
    );
    const frozen = await paid();
    const reserve = () =>
      reserveToolTask(frozen.uid, randomUUID(), {}, "refund-fixture", () => ({
        provider: "fixture",
        model: "fixture",
        credits: 30,
        executionConfig: {},
      }));
    const task = await reserve();
    const blocked = await createRefund(actor, request(frozen.id));
    assert.equal(blocked.status, "BLOCKED");
    assert.equal(creates, before);
    const [other] = await db
      .insert(creditPackages)
      .values({
        userId: frozen.uid,
        initialCredits: 20,
        remainingCredits: 20,
        status: "ACTIVE",
        transType: "SYSTEM_ADJUST",
      })
      .returning();
    const ev = {
      id: `refund-${frozen.id}`,
      type: "PAYMENT.CAPTURE.REFUNDED",
      provider: "paypal" as const,
      environment: frozen.environment,
      accountId: frozen.accountId,
      refund: fact(frozen),
    };
    await Promise.all(Array.from({ length: 8 }, () => receivePaymentEvent(ev)));
    v = await refundView(frozen.id);
    assert.equal(v.pkg!.remainingCredits, 0);
    assert.equal(v.pkg!.frozenCredits, 30);
    assert.equal(v.order.refundCreditShortfall, 30);
    await assert.rejects(reserve, /退款积分尚待审核/);
    await assert.rejects(() =>
      waiveRefundLoss(actor, {
        requestId: randomUUID(),
        orderId: frozen.id,
        reason: "隔离测试审核原因达到十二字以上",
        acknowledgeLoss: true,
      }),
    );
    await finishTask(task.id, null, {
      errorCode: "FIXTURE",
      errorMessage: "isolated failure",
    });
    v = await refundView(frozen.id);
    assert.equal(v.pkg!.refundReclaimedCredits, 100);
    assert.equal(v.order.refundCreditShortfall, 0);
    assert.equal(
      (
        await db
          .select()
          .from(creditPackages)
          .where(eq(creditPackages.id, other.id))
      )[0].remainingCredits,
      20,
    );
    const consumed = await paid();
    const ct = await reserveToolTask(
      consumed.uid,
      randomUUID(),
      {},
      "refund-fixture",
      () => ({
        provider: "fixture",
        model: "fixture",
        credits: 40,
        executionConfig: {},
      }),
    );
    await db
      .update(tasks)
      .set({ status: "RUNNING" })
      .where(eq(tasks.id, ct.id));
    await finishTask(ct.id, null, { result: "fixture success" });
    assert.equal(
      (await createRefund(actor, request(consumed.id))).status,
      "BLOCKED",
    );
    await receiveRefundFact(fact(consumed));
    v = await refundView(consumed.id);
    assert.equal(v.order.refundCreditShortfall, 40);
    const review = {
      requestId: randomUUID(),
      orderId: consumed.id,
      reason: "确认隔离测试中已消费积分损失由商户承担",
      acknowledgeLoss: true as const,
    };
    await waiveRefundLoss(actor, review);
    await waiveRefundLoss(actor, review);
    assert.equal((await refundView(consumed.id)).order.refundCreditsWaived, 40);
    const running = await paid();
    const rt = await reserveToolTask(
      running.uid,
      randomUUID(),
      {},
      "refund-fixture",
      () => ({
        provider: "fixture",
        model: "fixture",
        credits: 20,
        executionConfig: {},
      }),
    );
    await db
      .update(tasks)
      .set({ status: "RUNNING" })
      .where(eq(tasks.id, rt.id));
    await receiveRefundFact(fact(running));
    assert.equal(
      (await refundView(running.id)).order.refundCreditShortfall,
      20,
    );
    await finishTask(rt.id, null, {
      result: "preexisting task still completes",
    });
    const completed = await refundView(running.id);
    assert.equal(completed.pkg!.frozenCredits, 0);
    assert.equal(completed.pkg!.remainingCredits, 0);
    assert.equal(completed.order.refundCreditShortfall, 20);
    console.log(
      "PASS frozen/consumed refund block before HTTP; signed-event path concurrency; external cash refund debt, task gating, failed-task release reclaims original source; audited loss waiver idempotent.",
    );
    const w = await paid("waffo");
    const wr = await createRefund(actor, request(w.id, 250));
    const raw = JSON.stringify({
      eventId: `RFD_${wr.id}`,
      eventType: "refund.succeeded",
      storeId: "STO_fixture",
      mode: "test",
      data: {
        paymentId: w.paymentId,
        orderMerchantExternalId: w.id,
        refundStatus: "succeeded",
        refundedAmount: "2.50",
        currency: "USD",
        refundTicketMerchantExternalId: wr.id,
      },
    });
    const t = Date.now().toString();
    const signature = sign(
      "RSA-SHA256",
      Buffer.from(`${t}.${raw}`),
      keys.privateKey,
    ).toString("base64");
    const signed = verifyWaffo(
      new Request("https://fixture.example.com", {
        headers: { "x-waffo-signature": `t=${t},v1=${signature}` },
      }),
      raw,
    );
    await receivePaymentEvent(signed);
    await receivePaymentEvent(signed);
    assert.equal((await refundView(w.id)).pkg!.refundReclaimedCredits, 50);
    assert.equal(
      (await createRefund(actor, request(w.id, 250))).status,
      "BLOCKED",
    );
    assert.throws(() =>
      verifyWaffo(
        new Request("https://fixture.example.com", {
          headers: { "x-waffo-signature": `t=${t},v1=${signature}` },
        }),
        raw.replace("2.50", "5.00"),
      ),
    );
    await assert.rejects(() =>
      receiveRefundFact({
        ...fact(w, wr),
        externalId: `RFD_${wr.id}`,
        amount: 500,
      }),
    );
    await assert.rejects(() =>
      receiveRefundFact({ ...fact(w), accountId: "wrong" }),
    );
    console.log(
      "PASS Waffo signed raw-body refund, duplicate callback, one-refund channel restriction, forged signature and association mismatch rejection.",
    );
    const rollback = await paid();
    const rr = await createRefund(actor, request(rollback.id));
    const trigger = `refund_fixture_${randomUUID().replaceAll("-", "")}`;
    await db.execute(
      sql.raw(
        `CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id='${rollback.uid}' AND NEW.trans_type='REFUND_RECLAIM' THEN RAISE EXCEPTION 'fixture rollback'; END IF; RETURN NEW; END $$`,
      ),
    );
    await db.execute(
      sql.raw(
        `CREATE TRIGGER ${trigger} BEFORE INSERT ON credit_transactions FOR EACH ROW EXECUTE FUNCTION ${trigger}()`,
      ),
    );
    const rev = {
      ...ev,
      id: `refund-${rollback.id}`,
      refund: fact(rollback, rr),
    };
    try {
      await assert.rejects(() => receivePaymentEvent(rev));
      assert.equal((await refundView(rollback.id)).order.refundedAmount, 0);
      assert.equal(
        (await refundView(rollback.id)).pkg!.refundReservedCredits,
        100,
      );
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
    console.log(
      "PASS atomic rollback of refund/credits and durable notification recovery; no real payment/model HTTP used.",
    );
  } finally {
    globalThis.fetch = original;
    for (const uid of ids.slice().reverse()) {
      const orders = await db
        .select({ id: paymentOrders.id })
        .from(paymentOrders)
        .where(eq(paymentOrders.userId, uid));
      const orderIds = orders.map((o) => o.id);
      if (orderIds.length)
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
      if (orderIds.length) {
        await db
          .delete(paymentEvents)
          .where(inArray(paymentEvents.orderId, orderIds));
        await db
          .delete(paymentRefundReviews)
          .where(inArray(paymentRefundReviews.orderId, orderIds));
        await db
          .delete(paymentRefunds)
          .where(inArray(paymentRefunds.orderId, orderIds));
        await db
          .delete(paymentFulfillments)
          .where(inArray(paymentFulfillments.orderId, orderIds));
      }
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
