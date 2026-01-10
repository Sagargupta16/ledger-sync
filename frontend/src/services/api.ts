/**
 * API Service Layer
 * Connects LedgerSync Frontend to Backend
 */

import type { Transaction } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

/**
 * Backend transaction format
 */
interface BackendTransaction {
  id: number;
  date: string;
  amount: number;
  type: string;
  category: string;
  subcategory?: string;
  account: string;
  description?: string;
  hash_id: string;
  file_source: string;
  created_at: string;
  updated_at: string;
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
 * Transform backend transaction to frontend format
 */
function transformTransaction(tx: BackendTransaction): Transaction {
  return {
    id: tx.hash_id || String(tx.id),
    date: new Date(tx.date),
    time: new Date(tx.date).toLocaleTimeString("en-US", { hour12: false }),
    amount: Math.abs(tx.amount),
    type: mapTransactionType(tx.type),
    category: tx.category || "Uncategorized",
    subcategory: tx.subcategory || "",
    account: tx.account || "Unknown",
    note: tx.description || "",
    description: tx.description || "",
    notes: tx.description || "",
    tags: [],
  };
}

/**
 * Map backend transaction type to frontend format
 */
function mapTransactionType(type: string): Transaction["type"] {
  const typeMap: Record<string, Transaction["type"]> = {
    income: "Income",
    expense: "Expense",
    transfer: "Transfer",
    reimbursement: "Reimbursement",
    investment: "Investment",
  };
  return typeMap[type.toLowerCase()] || "Expense";
}

/**
 * Fetch all transactions from backend
 */
export async function fetchTransactions(): Promise<Transaction[]> {
  const response = await fetch(`${API_BASE_URL}/api/transactions`);

  if (!response.ok) {
    throw new Error(`Failed to fetch transactions: ${response.statusText}`);
  }

  const data: BackendTransaction[] = await response.json();
  return data.map(transformTransaction);
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
  } catch (error) {
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
