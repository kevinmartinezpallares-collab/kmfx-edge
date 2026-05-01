export const FUNDING_TRANSACTION_TYPES = Object.freeze([
  "challenge_fee",
  "reset_fee",
  "rebuy_fee",
  "discount",
  "refund",
  "payout",
  "withdrawal",
  "adjustment",
]);

const FEE_TYPES = new Set(["challenge_fee", "reset_fee", "rebuy_fee"]);
const POSITIVE_TYPES = new Set(["discount", "refund", "payout", "withdrawal"]);

export const FUNDING_TRANSACTION_TYPE_LABELS = Object.freeze({
  challenge_fee: "Coste challenge",
  reset_fee: "Reset",
  rebuy_fee: "Rebuy",
  discount: "Descuento",
  refund: "Refund",
  payout: "Payout",
  withdrawal: "Retirada",
  adjustment: "Ajuste",
});

function cleanText(value = "") {
  return String(value ?? "").trim();
}

function numericAmount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function transactionAmountForType(type = "", amount = 0) {
  const value = numericAmount(amount);
  if (FEE_TYPES.has(type)) return -Math.abs(value);
  if (POSITIVE_TYPES.has(type)) return Math.abs(value);
  return value;
}

function transactionDate(value = "") {
  if (value) return String(value);
  return new Date().toISOString().slice(0, 10);
}

export function isFundingTransactionType(type = "") {
  return FUNDING_TRANSACTION_TYPES.includes(type);
}

export function fundingTransactionTypeLabel(type = "") {
  return FUNDING_TRANSACTION_TYPE_LABELS[type] || "Movimiento";
}

export function normalizeFundingTransaction(input = {}, fallback = {}) {
  const type = isFundingTransactionType(input.type) ? input.type : "adjustment";
  const now = new Date().toISOString();

  return {
    id: input.id || `funding-tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    journeyId: cleanText(input.journeyId || fallback.journeyId),
    phaseId: cleanText(input.phaseId || fallback.phaseId),
    type,
    amount: transactionAmountForType(type, input.amount),
    currency: cleanText(input.currency || fallback.currency || "USD"),
    date: transactionDate(input.date),
    label: cleanText(input.label || fundingTransactionTypeLabel(type)),
    notes: cleanText(input.notes),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  };
}

export function fundingTransactionsForJourney(transactions = [], journeyId = "") {
  if (!journeyId || !Array.isArray(transactions)) return [];
  return transactions
    .filter((transaction) => transaction?.journeyId === journeyId)
    .map((transaction) => normalizeFundingTransaction(transaction))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
}

export function deriveFundingEconomics(transactions = []) {
  const ledger = Array.isArray(transactions) ? transactions.map((transaction) => normalizeFundingTransaction(transaction)) : [];
  const feeTransactions = ledger.filter((transaction) => FEE_TYPES.has(transaction.type));
  const totalFees = feeTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalSpent = Math.abs(feeTransactions.filter((transaction) => transaction.amount < 0).reduce((sum, transaction) => sum + transaction.amount, 0));
  const totalRefunds = ledger.filter((transaction) => transaction.type === "refund").reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalPayouts = ledger.filter((transaction) => transaction.type === "payout").reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalWithdrawals = ledger.filter((transaction) => transaction.type === "withdrawal").reduce((sum, transaction) => sum + transaction.amount, 0);
  const totalAdjustments = ledger
    .filter((transaction) => transaction.type === "adjustment" || transaction.type === "discount")
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const netFundingResult = ledger.reduce((sum, transaction) => sum + transaction.amount, 0);
  const roiOnCosts = totalSpent > 0 ? netFundingResult / totalSpent : null;

  return {
    transactions: ledger,
    hasTransactions: ledger.length > 0,
    totalSpent,
    totalFees,
    totalRefunds,
    totalPayouts,
    totalWithdrawals,
    totalAdjustments,
    netFundingResult,
    roiOnCosts,
  };
}
