/**
 * File upload component for backend integration
 */

import { useState } from "react";
import { uploadExcelFile, type UploadStats } from "../services/api";
import { useSetTransactions, useSetError } from "../store/financialStore";
import { fetchTransactions } from "../services/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { AlertCircle, CheckCircle, Upload as UploadIcon } from "lucide-react";

export function FileUpload() {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadStats | null>(null);
  const setTransactions = useSetTransactions();
  const setError = useSetError();

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file extension
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls")) {
      setUploadStatus("Please upload an Excel file (.xlsx or .xls)");
      return;
    }

    // Store file and show confirmation dialog
    setSelectedFile(file);
    setShowConfirmDialog(true);

    // Reset input to allow re-selecting the same file
    event.target.value = "";
  };

  const handleConfirmUpload = async () => {
    if (!selectedFile) return;

    try {
      setUploading(true);
      setShowConfirmDialog(false);
      setUploadStatus("Uploading...");

      // Upload file to backend
      const response = await uploadExcelFile(selectedFile, false);

      setUploadResult(response.stats);
      setUploadStatus(`Successfully uploaded! ${response.stats.processed} transactions processed.`);

      // Reload transactions from backend
      const transactions = await fetchTransactions();
      setTransactions(transactions);

      // Clear status after 5 seconds
      setTimeout(() => {
        setUploadStatus("");
        setUploadResult(null);
      }, 5000);
    } catch (error) {
      console.error("Upload error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to upload file";
      setUploadStatus(`Error: ${errorMessage}`);
      setError(errorMessage);
    } finally {
      setUploading(false);
      setSelectedFile(null);
    }
  };

  const handleCancelUpload = () => {
    setShowConfirmDialog(false);
    setSelectedFile(null);
  };

  return (
    <>
      <div className="file-upload">
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileUpload}
          disabled={uploading}
          id="file-upload-input"
          style={{ display: "none" }}
        />
        <label
          htmlFor="file-upload-input"
          className={`upload-button ${uploading ? "disabled" : ""}`}
          style={{
            padding: "8px 16px",
            backgroundColor: uploading ? "#ccc" : "#007bff",
            color: "white",
            borderRadius: "4px",
            cursor: uploading ? "not-allowed" : "pointer",
            display: "inline-block",
          }}
        >
          {uploading ? "Uploading..." : "Upload Excel"}
        </label>
        {uploadStatus && (
          <span
            style={{
              marginLeft: "12px",
              color: uploadStatus.includes("Error") ? "#dc3545" : "#28a745",
            }}
          >
            {uploadStatus}
          </span>
        )}

        {/* Success Details */}
        {uploadResult && !uploadStatus.includes("Error") && (
          <div
            style={{
              marginTop: "12px",
              padding: "12px",
              backgroundColor: "#d4edda",
              borderRadius: "4px",
              border: "1px solid #c3e6cb",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <CheckCircle size={20} color="#28a745" />
              <strong style={{ color: "#155724" }}>Upload Summary</strong>
            </div>
            <div style={{ fontSize: "14px", color: "#155724", lineHeight: "1.6" }}>
              <div>
                ✨ <strong>Inserted:</strong> {uploadResult.inserted} new transactions
              </div>
              <div>
                🔄 <strong>Updated:</strong> {uploadResult.updated} transactions
              </div>
              <div>
                🗑️ <strong>Deleted:</strong> {uploadResult.deleted} transactions
              </div>
              <div>
                ⏸️ <strong>Unchanged:</strong> {uploadResult.unchanged} transactions
              </div>
              <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #c3e6cb" }}>
                📊 <strong>Total Processed:</strong> {uploadResult.processed} transactions
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      <Dialog
        open={showConfirmDialog}
        onOpenChange={(open) => {
          // Only allow closing via Cancel button, not by clicking outside or Escape
          if (!open) {
            handleCancelUpload();
          }
        }}
      >
        <DialogContent
          className="sm:max-w-md bg-slate-900 border-slate-700"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl text-white">
              <AlertCircle className="h-6 w-6 text-yellow-500" />
              Confirm Excel Upload
            </DialogTitle>
            <DialogDescription className="text-slate-300">
              You are about to upload: <strong className="text-white">{selectedFile?.name}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <UploadIcon className="h-4 w-4" />
                This upload will:
              </h4>
              <ul className="space-y-2 text-sm text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="text-green-400 font-bold">✨</span>
                  <span>
                    <strong className="text-white">Insert</strong> new transactions found in the
                    file
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 font-bold">🔄</span>
                  <span>
                    <strong className="text-white">Update</strong> existing transactions that have
                    changed
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 font-bold">🗑️</span>
                  <span>
                    <strong className="text-white">Soft delete</strong> transactions no longer in
                    the file
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-gray-400 font-bold">⏸️</span>
                  <span>
                    <strong className="text-white">Skip</strong> unchanged transactions
                  </span>
                </li>
              </ul>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
              <p className="text-sm text-yellow-200">
                <strong>Note:</strong> This operation will sync your database with the Excel file.
                Existing data may be modified.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelUpload}
              className="border-slate-600 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirmUpload}
              className="bg-blue-600 hover:bg-blue-500"
            >
              Yes, Upload & Sync
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
