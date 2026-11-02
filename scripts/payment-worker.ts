import { config } from "dotenv";
import { fileURLToPath } from "node:url";
config({
  path: fileURLToPath(new URL("../.env.local", import.meta.url)),
  quiet: true,
});
async function main() {
  const { processOrder, recoverPaymentEvent } = await import(
    "../src/services/orders"
  );
  const { db } = await import("../src/db");
  const { processRefund } = await import("../src/services/refunds");
  const { processPaymentOperation } = await import(
    "../src/services/payment-operations"
  );
  let stopping = false;
  process.on("SIGTERM", () => {
    stopping = true;
  });
  process.on("SIGINT", () => {
    stopping = true;
  });
  console.log(
    "Payment worker ready; durable checkout creation and payment reconciliation.",
  );
  try {
    while (!stopping) {
      try {
        const recovered = await recoverPaymentEvent();
        const worked = await processOrder();
        const refunded = await processRefund();
        const operated = await processPaymentOperation();
        if (!worked && !recovered && !refunded && !operated)
          await new Promise((r) => setTimeout(r, 2000));
      } catch {
        console.error("Payment step interrupted; durable retry retained.");
        await new Promise((r) => setTimeout(r, 3000));
      }
      if (process.argv.includes("--once")) break;
    }
  } finally {
    await db.$client.end({ timeout: 5 });
  }
}
main().catch(() => {
  console.error("Payment worker startup failed.");
  process.exitCode = 1;
});
