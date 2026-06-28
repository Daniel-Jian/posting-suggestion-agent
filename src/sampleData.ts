import type { Account, UnresolvedCase } from "./types";

export const sampleUnresolvedCases: UnresolvedCase[] = [
  {
    id: "case_001",
    transaction: {
      id: "tx_001",
      source: "bank",
      booking_date: "2026-01-18",
      counterparty_name: "Amazon Payments Europe",
      purpose: "Amazon Business Rechnung DE-2026-001",
      amount: -119.0,
      currency: "EUR"
    },
    candidate_receipts: [
      {
        id: "rcpt_001",
        type: "incoming_invoice",
        supplier_name: "Amazon Business",
        invoice_number: "DE-2026-001",
        invoice_date: "2026-01-15",
        currency: "EUR",
        gross_amount: 119.0,
        net_amount: 100.0,
        vat_amount: 19.0,
        vat_rate: 19,
        description: "Buerobedarf: Druckerpapier und Stifte",
        ocr_text: "Amazon Business Rechnung DE-2026-001 Buerobedarf 119,00 EUR inkl. 19% MwSt"
      }
    ],
    deterministic_context: {
      status: "low_confidence",
      reason: "Regelwerk hat einen moeglichen Beleg gefunden, aber keine zuverlaessige kundenspezifische Kontenzuordnung",
      candidate_receipt_ids: ["rcpt_001"],
      candidate_account_codes: ["4930", "4600"]
    }
  },
  {
    id: "case_002",
    transaction: {
      id: "tx_002",
      source: "bank",
      booking_date: "2026-01-25",
      counterparty_name: "Stripe Payments Europe",
      purpose: "Stripe-Auszahlung Januar-Sammelzahlung nach Gebuehren und Erstattungen",
      amount: 967.2,
      currency: "EUR"
    },
    candidate_receipts: [],
    deterministic_context: {
      status: "unsupported_case",
      reason: "Zahlungsanbieter-Auszahlung kann Umsaetze, Gebuehren, Erstattungen und Splitbuchungen enthalten"
    }
  }
];

export const sampleAccounts: Account[] = [
  {
    code: "4930",
    name: "Buerobedarf",
    type: "expense",
    description: "Bueromaterial und kleinere Arbeitsmittel",
    examples: ["druckerpapier", "stifte", "buerobedarf"]
  },
  {
    code: "4600",
    name: "Werbekosten",
    type: "expense",
    description: "Werbung und Marketingaufwendungen",
    examples: ["google ads", "facebook ads", "online marketing"]
  },
  {
    code: "NebenkostenGeldverkehr",
    name: "Nebenkosten des Geldverkehrs",
    type: "expense",
    description: "Zahlungsanbieter- und Bankgebuehren",
    examples: ["stripe-gebuehr", "paypal-gebuehr", "bankgebuehr"]
  }
];
