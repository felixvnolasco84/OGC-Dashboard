import { describe, expect, it } from "vitest";
import { upsertPaymentAccount } from "./paymentAccounts.ts";

function fixture() {
  const accounts = [];
  const ctx = {
    db: {
      query: () => ({ withIndex: (_name, predicate) => {
        const filters = {};
        const builder = { eq: (field, value) => { filters[field] = value; return builder; } };
        predicate(builder);
        return { collect: async () => accounts.filter(account =>
          Object.entries(filters).every(([field, value]) => account[field] === value)) };
      } }),
      insert: async (_table, document) => {
        const id = `account-${accounts.length + 1}`;
        accounts.push({ _id: id, ...document });
        return id;
      },
      patch: async (id, changes) => {
        Object.assign(accounts.find(account => account._id === id), changes);
      },
    },
  };
  const save = (scopeKey, input) => upsertPaymentAccount(ctx, {
    scopeKey, providerId: "provider-1", input, source: "transaction",
  });
  return { accounts, save };
}

describe("payment account upsert", () => {
  it("is idempotent and preserves leading zeroes", async () => {
    const { accounts, save } = fixture();
    expect((await save("organization:one", { banco: "Bánco Uno", numero_cuenta: "00-1234 5678" })).status).toBe("created");
    expect((await save("organization:one", { banco: "BANCO UNO", numero_cuenta: "0012345678" })).status).toBe("existing");
    expect(accounts).toHaveLength(1);
    expect(accounts[0].numero_cuenta).toBe("0012345678");
  });

  it("keeps organizations separate", async () => {
    const { accounts, save } = fixture();
    const input = { banco: "Banco Uno", numero_cuenta: "0012345678" };
    await save("organization:one", input);
    await save("organization:two", input);
    expect(accounts).toHaveLength(2);
  });

  it("holds contradictory CLABEs for review", async () => {
    const { accounts, save } = fixture();
    await save("organization:one", { banco: "Banco Uno", numero_cuenta: "0012345678", clabe: "012345678901234567" });
    expect((await save("organization:one", {
      banco: "Banco Uno", numero_cuenta: "0012345678", clabe: "112345678901234567",
    })).status).toBe("conflict");
    expect(accounts).toHaveLength(1);
    expect(accounts[0].status).toBe("pending_review");
  });

  it("joins CLABE-only and full records without a duplicate", async () => {
    const { accounts, save } = fixture();
    await save("organization:one", { banco: "Banco Uno", clabe: "012345678901234567" });
    expect((await save("organization:one", {
      banco: "Banco Uno", numero_cuenta: "0012345678", clabe: "012345678901234567",
    })).status).toBe("existing");
    expect(accounts).toHaveLength(1);
    expect(accounts[0].identity_key).toBe("BANCO UNO|account:0012345678");
  });
});
