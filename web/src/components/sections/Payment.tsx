import { Prohibit, Receipt, Wallet } from "@phosphor-icons/react/dist/ssr";
import type { Payments } from "@/lib/data";
import { addressUrl, dollars, ordinal, pad2, short, txUrl, usdc } from "@/lib/format";
import { askedPrice, exceeded } from "@/lib/view";
import { ExtLink } from "../ExtLink";

/** Three perforated receipts, one voided, and the Base Account's allowance book. */
export function Payment({ payments }: { payments: Payments }) {
  const perCall = usdc(payments.usdcPerCall);
  const paidCalls = payments.calls.filter((c) => c.paid);
  const { budget } = payments;
  const allowance = BigInt(budget.permission.allowance);
  const refusedDraw = budget.overBudgetDraw ? exceeded(budget.overBudgetDraw.reason) : undefined;
  const received = BigInt(payments.sellerUsdcAfter) - BigInt(payments.sellerUsdcBefore);

  return (
    <div className="pay-grid">
      <div className="paper paper-w doc">
        <div className="rb-top">
          <div>
            <span className="lbl">Paid per call</span>
            <p className="figure">{perCall}</p>
            <p className="cap">
              USDC, read from negotiation #{payments.negotiationId}: {dollars(payments.settledPrice)} per 1,000 calls
            </p>
          </div>
          <div className="rb-side">
            <div>
              <span className="lbl">Seller received</span>
              <span className="ty">
                {usdc(received)} for {paidCalls.length} paid {paidCalls.length === 1 ? "call" : "calls"}
              </span>
            </div>
            <div>
              <span className="lbl">Paid from</span>
              <ExtLink href={addressUrl(budget.baseAccount)}>Base Account {short(budget.baseAccount)}</ExtLink>
              <span className="lbl note">
                Daily allowance of {usdc(allowance)}
                {budget.overBudgetDraw ? `; Base rejected a ${ordinal(budget.draws.length + 1)} draw` : ""}
              </span>
            </div>
          </div>
        </div>
        <ol className="stubs" aria-label="Calls to the seller's API">
          {payments.calls.map((c, i) => {
            const path = new URL(c.url).pathname;
            const asked = c.refusal ? askedPrice(c.refusal) : undefined;
            return (
              <li key={i} className={c.paid ? "stub" : "stub void"}>
                <span className="no">{pad2(i + 1)}</span>
                <p className="ep">GET {path}</p>
                {c.paid ? (
                  <>
                    <p className="amt">{perCall}</p>
                    <p className="state">
                      <Receipt size="1.1em" weight="light" aria-hidden />
                      Paid in USDC
                    </p>
                    {c.transaction && <ExtLink href={txUrl(c.transaction)}>{short(c.transaction)}</ExtLink>}
                  </>
                ) : (
                  <>
                    <p className="amt">
                      <span className="sr">Asked </span>
                      {asked ?? "another price"}
                    </p>
                    <span className="void-mark">Refused before signing</span>
                    {asked && (
                      <p>
                        Asked {asked} per call; the deal says {perCall}
                      </p>
                    )}
                    <p className="notx">
                      <Prohibit size="1.1em" weight="light" aria-hidden />
                      No transaction
                    </p>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="paper paper-y passbook">
        <div className="doc-top">
          <p className="doc-title">
            <Wallet size="1.1em" weight="light" aria-hidden />
            Allowance book
          </p>
        </div>
        <div className="pb-cap">
          <span className="lbl">Daily allowance (Spend Permission)</span>
          <span className="ty-big">{usdc(allowance)}</span>
          <span className="lbl">Granted to</span>
          <span className="ty">the buyer agent, which held no USDC of its own before the first draw</span>
          <span className="lbl">Approval</span>
          <ExtLink href={txUrl(budget.approveTx)}>Permission {short(budget.approveTx)}</ExtLink>
        </div>
        <table className="pb-led">
          <caption className="sr">Draws from the Base Account against the daily allowance</caption>
          <thead>
            <tr>
              <th scope="col">Draw</th>
              <th scope="col" className="r">
                Amount
              </th>
              <th scope="col" className="r">
                Left today
              </th>
            </tr>
          </thead>
          <tbody>
            {budget.draws.map((tx, i) => (
              <tr key={tx}>
                <td>
                  {i + 1}, before payment {i + 1}
                  <ExtLink href={txUrl(tx)} className="draw-tx">
                    {short(tx)}
                  </ExtLink>
                </td>
                <td className="r">{perCall}</td>
                <td className="r">{usdc(allowance - BigInt(payments.usdcPerCall) * BigInt(i + 1))}</td>
              </tr>
            ))}
            {budget.overBudgetDraw && (
              <tr className="rej">
                <td colSpan={3}>
                  <span>{budget.draws.length + 1}, rejected by Base</span>
                  <span className="rejnote">
                    <code>{budget.overBudgetDraw.reason}</code>
                    {refusedDraw &&
                      `: in atomic USDC (6 decimals), a ${ordinal(budget.draws.length + 1)} draw would bring today's total to ${usdc(refusedDraw.wanted)}, over the ${usdc(refusedDraw.allowed)} allowance.`}{" "}
                    Checked without a transaction.
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
