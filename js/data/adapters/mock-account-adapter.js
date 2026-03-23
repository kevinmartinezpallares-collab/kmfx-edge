import { createAccountRecord } from "./internal-model-adapter.js";

export function adaptMockAccount(rawAccount) {
  return createAccountRecord({
    id: rawAccount.id,
    name: rawAccount.name,
    broker: rawAccount.broker,
    sourceType: rawAccount.sourceType || "mock",
    payload: rawAccount.payload,
    meta: {
      environment: "mock",
      variant: rawAccount.id
    }
  });
}

export function adaptMockAccounts(rawAccounts) {
  return Object.fromEntries(
    Object.values(rawAccounts).map((rawAccount) => [rawAccount.id, adaptMockAccount(rawAccount)])
  );
}
