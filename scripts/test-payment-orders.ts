import { config } from "dotenv";
import {
  randomUUID,
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
  sign,
} from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
config({ path: ".env.local", quiet: true });
async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55432");
  assert.equal(url.pathname, "/laconic_local");
  if (existsSync(".local/payment-worker.pid")) {
    try {
      process.kill(
        Number(readFileSync(".local/payment-worker.pid", "utf8")),
        0,
      );
      throw new Error("Stop managed payment worker before fixtures");
    } catch (e) {
      if (!(e instanceof Error) || !("code" in e) || e.code !== "ESRCH")
        throw e;
    }
  }
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
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
    WAFFO_PRIVATE_KEY: privateKey,
    WAFFO_WEBHOOK_PUBLIC_KEY: publicKey,
    WAFFO_PRODUCT_STARTER: "PROD_fixture",
    WAFFO_PRODUCT_STANDARD: "PROD_fixture_standard",
    PAYMENT_RETURN_BASE_URL: "https://local-test.example.com",
    WAFFO_RETURN_BASE_URL: "https://local-test.example.com",
  });
  const {
    db,
    users,
    paymentOrders,
    paymentEvents,
    paymentFulfillments,
    creditPackages,
    creditTransactions,
  } = await import("../src/db");
  const { eq, and, sql } = await import("drizzle-orm");
  const {
    reserveOrder,
    processOrder,
    fulfillPayment,
    receivePaymentEvent,
    recoverPaymentEvent,
  } = await import("../src/services/orders");
  const { verifyWaffo, waffoConfig } = await import(
    "../src/payment/providers/waffo"
  );
  assert(waffoConfig().privateKey.includes("BEGIN PRIVATE KEY"));
  process.env.WAFFO_PRIVATE_KEY = createPrivateKey(privateKey)
    .export({ format: "der", type: "pkcs8" })
    .toString("base64");
  process.env.WAFFO_WEBHOOK_PUBLIC_KEY = createPublicKey(publicKey)
    .export({ format: "der", type: "spki" })
    .toString("base64");
  assert(waffoConfig().privateKey.includes("BEGIN PRIVATE KEY"));
  assert(waffoConfig().publicKey.includes("BEGIN PUBLIC KEY"));
  const { verifyPaypal } = await import("../src/payment/providers/paypal");
  const { cents } = await import("../src/payment/providers/types");
  const userId = randomUUID();
  const dashboardSampleId = `order.completed:TEST_${userId}`;
  const otherId = randomUUID();
  const fixtures = new Map<
    string,
    { id: string; internal: string; status: string; amount: string }
  >();
  let creates = 0;
  let captures = 0;
  let loseCreate = false;
  let verifyStatus = "SUCCESS";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const u = new URL(String(input));
    const body = init?.body
      ? JSON.parse(
          String(init.body).startsWith("grant_") ? "{}" : String(init.body),
        )
      : {};
    if (u.pathname === "/v1/oauth2/token")
      return Response.json({ access_token: "fixture-token" });
    if (u.pathname === "/v1/notifications/verify-webhook-signature")
      return Response.json({ verification_status: verifyStatus });
    if (u.pathname === "/v2/checkout/orders") {
      const key = (init?.headers as Record<string, string>)[
        "PayPal-Request-Id"
      ];
      let record = fixtures.get(key);
      if (!record) {
        creates++;
        record = {
          id: `TESTORDER${String(creates).padStart(8, "0")}`,
          internal: body.purchase_units[0].custom_id,
          status: "CREATED",
          amount: body.purchase_units[0].amount.value,
        };
        fixtures.set(key, record);
      }
      if (loseCreate) {
        loseCreate = false;
        throw new Error("lost response");
      }
      return Response.json({
        id: record.id,
        links: [
          {
            rel: "payer-action",
            href: `https://www.sandbox.paypal.com/checkoutnow?token=${record.id}`,
          },
        ],
      });
    }
    if (u.pathname.startsWith("/v2/checkout/orders/")) {
      const id = u.pathname.split("/")[4];
      const record = [...fixtures.values()].find((v) => v.id === id)!;
      if (u.pathname.endsWith("/capture")) {
        captures++;
        record.status = "COMPLETED";
      }
      return Response.json({
        id: record.id,
        status: record.status,
        purchase_units: [
          {
            custom_id: record.internal,
            payee: { merchant_id: "TESTMERCHANT" },
            amount: { currency_code: "USD", value: record.amount },
            ...(record.status === "COMPLETED"
              ? {
                  payments: {
                    captures: [
                      {
                        id: `CAP-${record.id}`,
                        status: "COMPLETED",
                        amount: { currency_code: "USD", value: record.amount },
                      },
                    ],
                  },
                }
              : {}),
          },
        ],
      });
    }
    if (u.hostname === "api.waffo.ai" && u.pathname.endsWith("create-session"))
      return Response.json({
        data: {
          sessionId: `cs_${randomUUID()}`,
          checkoutUrl: "https://checkout.waffo.ai/fixture/checkout/test",
        },
      });
    if (u.hostname === "api.waffo.ai" && u.pathname === "/v1/graphql")
      return Response.json({
        data: { onetimeOrders: [{ id: "ORD_fixture", status: "completed" }] },
      });
    throw new Error("Unexpected outbound request; blocked");
  };
  async function get(id: string) {
    return (
      await db.select().from(paymentOrders).where(eq(paymentOrders.id, id))
    )[0];
  }
  async function due(id: string) {
    await db
      .update(paymentOrders)
      .set({ nextCheckAt: new Date(Date.now() - 1000) })
      .where(eq(paymentOrders.id, id));
  }
  try {
    await db.insert(users).values([
      {
        id: userId,
        name: "Payment fixture",
        email: `pay-${userId}@example.invalid`,
        emailVerified: true,
      },
      {
        id: otherId,
        name: "Payment fixture other",
        email: `pay-${otherId}@example.invalid`,
        emailVerified: true,
      },
    ]);
    const requestId = randomUUID();
    const input = {
      requestId,
      provider: "paypal" as const,
      productId: "starter",
    };
    const reserved = await Promise.all(
      Array.from({ length: 8 }, () => reserveOrder(userId, input)),
    );
    assert.equal(new Set(reserved.map((v) => v.id)).size, 1);
    const order = reserved[0];
    await assert.rejects(() =>
      reserveOrder(userId, { ...input, productId: "standard" }),
    );
    loseCreate = true;
    await processOrder(order.id);
    assert.equal((await get(order.id)).status, "CREATING");
    await due(order.id);
    await processOrder(order.id);
    assert.equal((await get(order.id)).status, "PENDING");
    assert.equal(creates, 1);
    await due(order.id);
    await processOrder(order.id);
    assert.equal((await get(order.id)).status, "PENDING");
    assert.equal(
      (
        await db
          .select()
          .from(creditPackages)
          .where(eq(creditPackages.userId, userId))
      ).length,
      0,
    );
    fixtures.get(order.id)!.status = "APPROVED";
    await due(order.id);
    await Promise.all([processOrder(order.id), processOrder(order.id)]);
    assert.equal(captures, 1);
    assert.equal((await get(order.id)).status, "PAID");
    const fact = {
      internalId: order.id,
      externalId: (await get(order.id)).externalId!,
      paymentId: `CAP-${fixtures.get(order.id)!.id}`,
      provider: "paypal" as const,
      environment: "sandbox",
      accountId: "TESTMERCHANT",
      amount: 500,
      currency: "USD",
    };
    await Promise.all(Array.from({ length: 8 }, () => fulfillPayment(fact)));
    assert.equal(
      (
        await db
          .select()
          .from(creditPackages)
          .where(eq(creditPackages.userId, userId))
      ).length,
      1,
    );
    for (const mutation of [
      { amount: 499 },
      { currency: "EUR" },
      { accountId: "WRONG" },
      { environment: "live" },
      { externalId: "WRONG" },
    ])
      await assert.rejects(() => fulfillPayment({ ...fact, ...mutation }));
    console.log(
      "PASS concurrent replay, lost create response, one capture, unpaid no credits, mismatched amount/currency/account/environment rejected.",
    );
    const w = await reserveOrder(userId, {
      requestId: randomUUID(),
      provider: "waffo",
      productId: "starter",
    });
    await processOrder(w.id);
    await due(w.id);
    await processOrder(w.id);
    assert.equal((await get(w.id)).status, "PENDING");
    const event = {
      eventId: "PAY_fixture",
      eventType: "order.completed",
      storeId: "STO_fixture",
      mode: "test",
      data: {
        orderId: "ORD_fixture",
        paymentId: "PAY_fixture",
        paymentStatus: "succeeded",
        orderStatus: "completed",
        chargedAmount: "5.00",
        currency: "USD",
        orderMerchantExternalId: w.id,
      },
    };
    function signed(value: unknown, t = String(Date.now())) {
      const raw = JSON.stringify(value);
      const sig = sign(
        "RSA-SHA256",
        Buffer.from(`${t}.${raw}`),
        privateKey,
      ).toString("base64");
      return {
        request: new Request(
          "https://local-test.example.com/api/webhooks/waffo",
          { headers: { "x-waffo-signature": `t=${t},v1=${sig}` } },
        ),
        raw,
      };
    }
    for (const bad of [
      { ...event, mode: "prod" },
      { ...event, storeId: "STO_other" },
    ]) {
      const v = signed(bad);
      assert.throws(() => verifyWaffo(v.request, v.raw));
    }
    const expired = signed(event, String(Date.now() - 46 * 60000));
    assert.throws(() => verifyWaffo(expired.request, expired.raw));
    const v = signed(event);
    assert.throws(() => verifyWaffo(v.request, v.raw + " "));
    const verified = verifyWaffo(v.request, v.raw);
    const sample = signed({
      ...event,
      eventId: `TEST_${userId}`,
      data: {
        currency: "USD",
        amount: "0",
        productName: "[TEST] Webhook Verification",
      },
    });
    const sampleEvent = verifyWaffo(sample.request, sample.raw);
    assert.equal(sampleEvent.fact, undefined);
    assert.equal(sampleEvent.internalId, undefined);
    await receivePaymentEvent(sampleEvent);
    const [sampleReceipt] = await db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.eventId, dashboardSampleId));
    assert.equal(sampleReceipt.status, "IGNORED");
    await Promise.all(
      Array.from({ length: 6 }, () => receivePaymentEvent(verified)),
    );
    await receivePaymentEvent({
      ...verified,
      id: "different-event-same-payment",
    });
    assert.equal((await get(w.id)).status, "PAID");
    assert.equal(
      (
        await db
          .select()
          .from(paymentFulfillments)
          .where(eq(paymentFulfillments.orderId, w.id))
      ).length,
      1,
    );
    console.log(
      "PASS Waffo RSA raw-body verification, expiry/mode/store/tampering rejection, query alone no grant, duplicate events one fulfillment.",
    );
    const failed = await reserveOrder(otherId, {
      requestId: randomUUID(),
      provider: "paypal",
      productId: "standard",
    });
    await processOrder(failed.id);
    const failedFact = {
      ...fact,
      internalId: failed.id,
      externalId: (await get(failed.id)).externalId!,
      paymentId: "CAP-rollback",
      amount: 1500,
    };
    await db.insert(creditTransactions).values({
      transNo: `PAY_${failed.id}`,
      userId: otherId,
      transType: "SYSTEM_ADJUST",
      credits: 0,
      balanceAfter: 0,
      remark: "fixture deliberate conflict",
    });
    const recoverableEvent = {
      id: "recover-after-db-conflict",
      type: "fixture.verified-payment",
      provider: "paypal" as const,
      environment: "sandbox",
      accountId: "TESTMERCHANT",
      internalId: failed.id,
      fact: failedFact,
    };
    await assert.rejects(() => receivePaymentEvent(recoverableEvent));
    assert.equal(
      (
        await db
          .select()
          .from(creditPackages)
          .where(eq(creditPackages.userId, otherId))
      ).length,
      0,
    );
    assert.equal((await get(failed.id)).status, "PENDING");
    await db
      .delete(creditTransactions)
      .where(eq(creditTransactions.userId, otherId));
    assert.equal(await recoverPaymentEvent(), true);
    assert.equal((await get(failed.id)).status, "PAID");
    await assert.rejects(() =>
      fulfillPayment({ ...failedFact, paymentId: fact.paymentId }),
    );
    const stale = await reserveOrder(otherId, {
      requestId: randomUUID(),
      provider: "paypal",
      productId: "starter",
    });
    await db
      .update(paymentOrders)
      .set({ createdAt: new Date(Date.now() - 3700000) })
      .where(eq(paymentOrders.id, stale.id));
    const before = creates;
    await processOrder(stale.id);
    assert.equal((await get(stale.id)).status, "REVIEW");
    assert.equal(creates, before);
    const body = JSON.stringify({
      id: "WH-EVENT",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        supplementary_data: { related_ids: { order_id: fact.externalId } },
      },
    });
    const headers = {
      "paypal-auth-algo": "SHA256withRSA",
      "paypal-cert-url": "https://api.paypal.com/cert",
      "paypal-transmission-id": "fixture",
      "paypal-transmission-sig": "fixture",
      "paypal-transmission-time": new Date().toISOString(),
    };
    verifyStatus = "FAILURE";
    await assert.rejects(() =>
      verifyPaypal(
        new Request("https://local-test.example.com", { headers }),
        body,
      ),
    );
    verifyStatus = "SUCCESS";
    const pv = await verifyPaypal(
      new Request("https://local-test.example.com", { headers }),
      body,
    );
    await receivePaymentEvent(pv);
    assert.equal(
      (
        await db
          .select()
          .from(creditTransactions)
          .where(
            and(
              eq(creditTransactions.userId, userId),
              eq(creditTransactions.transType, "ORDER_PAY"),
            ),
          )
      ).length,
      2,
    );
    for (const bad of ["1e2", "-1.00", "1.001", "NaN"])
      assert.throws(() => cents(bad));
    console.log(
      "PASS atomic rollback/recovery, receipt conflict protection, expired create review, PayPal verification failure, safe integer currency parsing.",
    );
  } finally {
    await db
      .delete(paymentEvents)
      .where(
        and(
          eq(paymentEvents.provider, "waffo"),
          eq(paymentEvents.eventId, dashboardSampleId),
        ),
      );
    globalThis.fetch = originalFetch;
    for (const uid of [userId, otherId]) {
      const ids = await db
        .select({ id: paymentOrders.id })
        .from(paymentOrders)
        .where(eq(paymentOrders.userId, uid));
      for (const { id } of ids) {
        await db.delete(paymentEvents).where(eq(paymentEvents.orderId, id));
        await db
          .delete(paymentFulfillments)
          .where(eq(paymentFulfillments.orderId, id));
      }
      await db
        .delete(creditTransactions)
        .where(eq(creditTransactions.userId, uid));
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
