/**
 * API Service Layer
 * Connects LedgerSync Frontend to Backend
 */

import type { Transaction, Transfer, TransactionOrTransfer } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

/**
 * Backend transaction/transfer format
 */
interface BackendTransactionOrTransfer {
  id: string;
  date: string;
  amount: number;
  type: string;
  category: string;
  subcategory?: string;
  account: string;
  from_account?: string;
  to_account?: string;
  note?: string;
  description?: string;
  source_file: string;
  last_seen_at: string;
  is_transfer: boolean;
}

/**
 * Upload statistics
 */
export interface UploadStats {
  processed: number;
  inserted: number;
  updated: number;
  deleted: number;
  unchanged: number;
}

/**
 * Upload response
 */
export interface UploadResponse {
  success: boolean;
  message: string;
  stats: UploadStats;
  file_name: string;
  processed_count?: number; // Backward compatibility
}

/**
 * Meta responses
 */
export interface MetaTypes {
  transaction_types: string[];
  transfer_types: string[];
}

export interface MetaAccounts {
  accounts: string[];
}

export interface MetaFilters extends MetaTypes, MetaAccounts {}

export interface BucketResponse {
  needs: string[];
  wants: string[];
  savings: string[];
  investment_categories: string[];
  investment_accounts: string[];
}

/**
 * Transform backend transaction/transfer to frontend format
 */
function transformTransactionOrTransfer(tx: BackendTransactionOrTransfer): TransactionOrTransfer {
  if (tx.is_transfer) {
    return {
      id: tx.id,
      date: new Date(tx.date),
      time: new Date(tx.date).toLocaleTimeString("en-US", { hour12: false }),
      amount: Math.abs(tx.amount),
      type: tx.type as "Transfer-In" | "Transfer-Out",
      category: tx.category || "Transfer",
      subcategory: tx.subcategory || "",
      from_account: tx.from_account || tx.account,
      to_account: tx.to_account || "",
      account: tx.from_account || tx.account,
      note: tx.note || tx.description || "",
      description: tx.note || tx.description || "",
      notes: tx.note || tx.description || "",
      tags: [],
      is_transfer: true,
    } as Transfer;
  }

  return {
    id: tx.id,
    date: new Date(tx.date),
    time: new Date(tx.date).toLocaleTimeString("en-US", { hour12: false }),
    amount: Math.abs(tx.amount),
    type: mapTransactionType(tx.type),
    category: tx.category || "Uncategorized",
    subcategory: tx.subcategory || "",
    account: tx.account || "Unknown",
    note: tx.note || tx.description || "",
    description: tx.note || tx.description || "",
    notes: tx.note || tx.description || "",
    tags: [],
    is_transfer: false,
  } as Transaction;
}

/**
 * Map backend transaction type to frontend format
 */
function mapTransactionType(type: string): Transaction["type"] {
  const typeMap: Record<string, Transaction["type"]> = {
    income: "Income",
    expense: "Expense",
    reimbursement: "Reimbursement",
    investment: "Investment",
  };
  return typeMap[type.toLowerCase()] || "Expense";
}

/**
 * Master categories structure
 */
export interface MasterCategories {
  income: Record<string, string[]>;
  expense: Record<string, string[]>;
}

/**
 * Fetch master categories organized by type
 */
export async function fetchMasterCategories(): Promise<MasterCategories> {
  const response = await fetch(`${API_BASE_URL}/api/calculations/categories/master`);

  if (!response.ok) {
    throw new Error(`Failed to fetch categories: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Fetch meta: transaction/transfer types
 */
export async function fetchMetaTypes(): Promise<MetaTypes> {
  const response = await fetch(`${API_BASE_URL}/api/meta/types`);
  if (!response.ok) {
    throw new Error(`Failed to fetch types: ${response.statusText}`);
  }
  return await response.json();
}

/**
 * Fetch meta: accounts
 */
export async function fetchMetaAccounts(): Promise<MetaAccounts> {
  const response = await fetch(`${API_BASE_URL}/api/meta/accounts`);
  if (!response.ok) {
    throw new Error(`Failed to fetch accounts: ${response.statusText}`);
  }
  return await response.json();
}

/**
 * Fetch combined filters meta (types + accounts)
 */
export async function fetchMetaFilters(): Promise<MetaFilters> {
  const response = await fetch(`${API_BASE_URL}/api/meta/filters`);
  if (!response.ok) {
    throw new Error(`Failed to fetch filters meta: ${response.statusText}`);
  }
  return await response.json();
}

/**
 * Fetch dynamic buckets (needs/wants/savings, investment categories/accounts)
 */
export async function fetchBuckets(): Promise<BucketResponse> {
  const response = await fetch(`${API_BASE_URL}/api/meta/buckets`);
  if (!response.ok) {
    throw new Error(`Failed to fetch buckets: ${response.statusText}`);
  }
  return await response.json();
}

/**
 * Fetch all transactions and transfers from backend
 */
export async function fetchTransactions(): Promise<TransactionOrTransfer[]> {
  const response = await fetch(`${API_BASE_URL}/api/transactions`);

  if (!response.ok) {
    throw new Error(`Failed to fetch transactions: ${response.statusText}`);
  }

  const data: BackendTransactionOrTransfer[] = await response.json();
  return data.map(transformTransactionOrTransfer);
}

/**
 * Upload Excel file to backend
 */
export async function uploadExcelFile(file: File, force = false): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const url = new URL(`${API_BASE_URL}/api/upload`);
  if (force) {
    url.searchParams.append("force", "true");
  }

  const response = await fetch(url.toString(), {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Upload failed: ${response.statusText}`);
  }

  const data: UploadResponse = await response.json();
  return data;
}

/**
 * Health check
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    return response.ok;
  } catch (_error) {
    return false;
  }
}

/**
 * Fetch analytics overview
 */
export async function fetchAnalyticsOverview(timeRange = "all_time") {
  const response = await fetch(`${API_BASE_URL}/api/analytics/overview?time_range=${timeRange}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch overview: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Fetch KPI data
 */
export async function fetchKPIs(timeRange = "all_time") {
  const response = await fetch(`${API_BASE_URL}/api/analytics/kpis?time_range=${timeRange}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch KPIs: ${response.statusText}`);
  }

  return await response.json();
}
