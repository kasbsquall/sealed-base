import { expect } from "chai";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { Wallet } from "ethers";
import { BASE_SEPOLIA, USDC_BASE_SEPOLIA, refusalReason, usdcPerCall, usdcToMoney, type Deal } from "../agents/x402/deal";
import { createSellerService } from "../agents/x402/sellerService";
import { createBuyerClient, settlementProblem } from "../agents/x402/buyerClient";

const buyerKey = Wallet.createRandom();
const seller = Wallet.createRandom().address;

const deal: Deal = {
  negotiationId: 6n,
  contract: "0x0C0E12C9C77FAcDa9302514A818DF232346e773A",
  buyer: buyerKey.address,
  seller,
  settledPrice: 4200n,
  usdcPerCall: usdcPerCall(4200n),
};

const honest = { scheme: "exact", network: BASE_SEPOLIA, asset: USDC_BASE_SEPOLIA, amount: "42000", payTo: seller, maxTimeoutSeconds: 300 };

describe("x402 payment at the settled price", () => {
  describe("price conversion", () => {
    it("turns US cents per 1,000 calls into atomic USDC per call", () => {
      expect(usdcPerCall(4200n)).to.equal(42_000n);
      expect(usdcPerCall(4115n)).to.equal(41_150n);
    });

    it("formats atomic USDC as an x402 money string without floating point", () => {
      expect(usdcToMoney(42_000n)).to.equal("$0.042000");
      expect(usdcToMoney(1_250_000n)).to.equal("$1.250000");
    });
  });

  describe("the buyer's refusal rule", () => {
    it("accepts exactly the settled price, in USDC on Base Sepolia, to the seller", () => {
      expect(refusalReason(honest, deal)).to.equal(undefined);
    });

    it("accepts the payee address in any letter case", () => {
      expect(refusalReason({ ...honest, payTo: seller.toLowerCase() }, deal)).to.equal(undefined);
    });

    it("refuses a price above the settled one", () => {
      expect(refusalReason({ ...honest, amount: "84000" }, deal)).to.match(/settled at 42000/);
    });

    it("refuses a price below it too, since that is not the deal either", () => {
      expect(refusalReason({ ...honest, amount: "1" }, deal)).to.match(/settled at 42000/);
    });

    it("refuses a payee that is not the negotiation's seller", () => {
      expect(refusalReason({ ...honest, payTo: Wallet.createRandom().address }, deal)).to.match(/not the seller/);
    });

    it("refuses another asset, another network and another scheme", () => {
      expect(refusalReason({ ...honest, asset: Wallet.createRandom().address }, deal)).to.match(/not USDC/);
      expect(refusalReason({ ...honest, network: "eip155:8453" }, deal)).to.match(/not Base Sepolia/);
      expect(refusalReason({ ...honest, scheme: "upto" }, deal)).to.match(/not exact/);
    });

    it("refuses a payment that would stay valid longer than five minutes", () => {
      expect(refusalReason({ ...honest, maxTimeoutSeconds: 1_000_000_000 }, deal)).to.match(/limit is 300 s/);
      expect(refusalReason({ ...honest, maxTimeoutSeconds: 0 }, deal)).to.match(/limit is 300 s/);
    });
  });

  describe("the buyer's reading of the seller's settlement report", () => {
    const report = { success: true, transaction: `0x${"ab".repeat(32)}`, network: BASE_SEPOLIA, payer: buyerKey.address };

    it("accepts a successful settlement by the buyer on Base Sepolia", () => {
      expect(settlementProblem(report, deal)).to.equal(undefined);
    });

    it("does not count a failed settlement, a malformed hash, another network or another payer", () => {
      expect(settlementProblem({ ...report, success: false, errorReason: "insufficient_funds" }, deal)).to.match(/insufficient_funds/);
      expect(settlementProblem({ ...report, transaction: "0x1234" }, deal)).to.match(/not a transaction hash/);
      expect(settlementProblem({ ...report, network: "eip155:8453" }, deal)).to.match(/not Base Sepolia/);
      expect(settlementProblem({ ...report, payer: Wallet.createRandom().address }, deal)).to.match(/not the buyer/);
    });
  });

  describe("buyer against the seller's live paywall", () => {
    let facilitator: Server;
    let service: Server;
    let base: string;
    const facilitatorCalls: string[] = [];

    before(async () => {
      // A stand-in facilitator: it advertises Base Sepolia and rejects every
      // payment, so nothing here can ever move funds.
      const fake = express().use(express.json());
      fake.get("/supported", (_req, res) =>
        res.json({ kinds: [{ x402Version: 2, scheme: "exact", network: BASE_SEPOLIA }], extensions: [], signers: {} }),
      );
      fake.post("/verify", (req, res) => {
        facilitatorCalls.push(req.body?.paymentRequirements?.amount ?? "unknown");
        res.json({ isValid: false, invalidReason: "test facilitator never settles" });
      });
      facilitator = await listen(fake);
      service = await listen(createSellerService(deal, `http://127.0.0.1:${port(facilitator)}`));
      base = `http://127.0.0.1:${port(service)}`;
    });

    after(() => {
      service?.close();
      facilitator?.close();
    });

    it("advertises the settled price and the seller as payee in its 402", async () => {
      const response = await fetch(`${base}/market-data`);
      expect(response.status).to.equal(402);
      const header = response.headers.get("payment-required");
      expect(header, "PAYMENT-REQUIRED header").to.be.a("string");
      const required = JSON.parse(Buffer.from(header!, "base64").toString("utf8"));
      const accepted = required.accepts[0];
      expect(accepted.amount).to.equal("42000");
      expect(accepted.payTo.toLowerCase()).to.equal(seller.toLowerCase());
      expect(accepted.asset.toLowerCase()).to.equal(USDC_BASE_SEPOLIA.toLowerCase());
    });

    it("refuses the surge endpoint before signing anything", async () => {
      const call = createBuyerClient(buyerKey.privateKey as `0x${string}`, deal);
      const before = facilitatorCalls.length;
      const result = await call(`${base}/market-data-surge`);
      expect(result.paid).to.equal(false);
      expect(result.refusal).to.match(/asks 84000 atomic USDC per call/);
      expect(facilitatorCalls.length, "no payment reached the facilitator").to.equal(before);
    });

    it("signs a payment for the honest endpoint at exactly the settled amount", async () => {
      const call = createBuyerClient(buyerKey.privateKey as `0x${string}`, deal);
      const result = await call(`${base}/market-data`);
      expect(result.refusal).to.equal(undefined);
      expect(result.paid).to.equal(false); // the stand-in facilitator rejects it
      expect(facilitatorCalls.at(-1)).to.equal("42000");
    });

    it("will not run with a key that is not the negotiation's buyer", () => {
      expect(() => createBuyerClient(Wallet.createRandom().privateKey as `0x${string}`, deal)).to.throw(/buyer of negotiation 6/);
    });
  });
});

function listen(app: express.Express): Promise<Server> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function port(server: Server): number {
  return (server.address() as AddressInfo).port;
}
