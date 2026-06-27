import type { UnresolvedCase } from "./types";

export const sampleUnresolvedCases: UnresolvedCase[] = [
  {
    id: "case-1001",
    receiptText: "Office supplies, stationery and printer paper",
    transactionText: "CARD PAYMENT OFFICE DEPOT",
    amount: 84.72,
    currency: "EUR",
    bookingDate: "2026-06-15",
    metadata: {
      source: "sample"
    }
  },
  {
    id: "case-1002",
    receiptText: "Monthly software subscription",
    transactionText: "SEPA DIRECT DEBIT SAAS VENDOR",
    amount: 29.0,
    currency: "EUR",
    bookingDate: "2026-06-18",
    metadata: {
      source: "sample"
    }
  }
];
