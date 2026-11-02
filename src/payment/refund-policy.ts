/** Cumulative rounding avoids losing credits through repeated tiny partial refunds. */
export function refundCreditTarget(
  credits: number,
  refundedCents: number,
  paidCents: number,
) {
  if (
    !Number.isSafeInteger(credits) ||
    !Number.isSafeInteger(refundedCents) ||
    !Number.isSafeInteger(paidCents) ||
    credits < 0 ||
    refundedCents < 0 ||
    paidCents <= 0 ||
    refundedCents > paidCents
  )
    throw new Error("Invalid refund amounts");
  return Number(
    (BigInt(credits) * BigInt(refundedCents) + BigInt(paidCents) - BigInt(1)) /
      BigInt(paidCents),
  );
}
