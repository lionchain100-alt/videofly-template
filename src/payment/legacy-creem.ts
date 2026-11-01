import { z } from "zod";
import { requireAuth, requireUserMutation } from "@/lib/api/auth";
import { handleApiError } from "@/lib/api/response";
import { reserveOrder, processOrder, listOrders } from "@/services/orders";
import {
  listSubscriptions,
  changeSubscription,
} from "@/services/subscriptions";
import { creemConfig, creemRequest } from "./providers/creem";
/** Compatibility facade for existing Better Auth Creem clients; all minting uses the common ledger. */
export async function legacyCreem(request: Request, action: string) {
  try {
    const read = ["has-access-granted", "retrieve-subscription"].includes(
      action,
    );
    const user = read
      ? await requireAuth(request)
      : await requireUserMutation(request);
    const subs = (await listSubscriptions(user.id)).filter(
      (s) => s.provider === "creem",
    );
    if (action === "has-access-granted") {
      const s = subs.find((s) => s.hasAccess);
      return Response.json({
        hasAccessGranted: !!s,
        subscription: s
          ? {
              id: s.externalId,
              productId: s.productId,
              periodEnd: s.paidThrough,
              status: s.status,
            }
          : null,
      });
    }
    if (action === "retrieve-subscription")
      return Response.json({ subscriptions: subs });
    if (action === "create-checkout") {
      const body = z
        .object({
          productId: z.string(),
          requestId: z.string().uuid().optional(),
        })
        .passthrough()
        .parse(await request.json());
      if (!body.requestId)
        return Response.json(
          {
            message: "统一收银台需要持久请求编号，请从购买积分页面操作。",
            redirect: "/buy-credits",
          },
          { status: 409 },
        );
      const order = await reserveOrder(user.id, {
        provider: "creem",
        productId: body.productId,
        requestId: body.requestId,
      });
      await processOrder(order.id);
      return Response.json({
        url: (await listOrders(user.id, order.id))[0]?.checkoutUrl,
        orderId: order.id,
      });
    }
    if (action === "cancel-subscription") {
      const body = z
          .object({ subscriptionId: z.string() })
          .passthrough()
          .parse(await request.json()),
        sub = subs.find((s) => s.externalId === body.subscriptionId);
      if (!sub)
        return Response.json({ message: "订阅不存在" }, { status: 404 });
      return Response.json({
        subscriptions: await changeSubscription(user.id, sub.id, "cancel"),
      });
    }
    if (action === "create-portal") {
      const c = creemConfig(),
        sub = subs.find(
          (s) => s.accountId === c.accountId && s.environment === c.environment,
        );
      if (!sub)
        return Response.json(
          { message: "没有可管理的 Creem 订阅" },
          { status: 404 },
        );
      const result = await creemRequest("/v1/customers/billing", "POST", {
        customer_id: sub.customerId,
      });
      const url = new URL(result.customer_portal_link);
      if (
        url.protocol !== "https:" ||
        !["creem.io", "www.creem.io"].includes(url.hostname)
      )
        throw Error("Invalid portal URL");
      return Response.json({ url: url.href });
    }
    return Response.json(
      { message: "请使用统一订阅管理页面" },
      { status: 404 },
    );
  } catch (e) {
    return handleApiError(e);
  }
}
