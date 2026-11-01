import { ApiError } from "@/lib/api/error";
export async function readBounded(request: Request | Response, limit = 262144) {
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError("缺少请求内容", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new ApiError("请求内容过长", 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
export async function paymentFetch(url: string, init: RequestInit) {
  try {
    const response = await fetch(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(25000),
    });
    const body = JSON.parse(await readBounded(response));
    if (!response.ok) throw new Error("provider rejected");
    return body;
  } catch {
    // Never log payment responses, Authorization headers, buyer identities or keys.
    throw new ApiError("支付平台暂时未能确认请求，请保留订单并稍后查询", 502);
  }
}
export function paymentReturnBase(providerOverride?: string) {
  const value = new URL(
    providerOverride ||
      process.env.PAYMENT_RETURN_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000",
  );
  if (
    value.username ||
    value.password ||
    (value.protocol !== "https:" &&
      !(
        process.env.NODE_ENV !== "production" &&
        value.origin === "http://localhost:3000"
      ))
  )
    throw new ApiError("支付回跳地址未正确配置", 503);
  return value.origin;
}
