"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, CheckCircle2, Loader2, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";

interface UploadStats {
  processed: number;
  inserted: number;
  updated: number;
  deleted: number;
  unchanged: number;
}

interface UploadResponse {
  success: boolean;
  message: string;
  stats: UploadStats;
  file_name: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function FileUpload() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [lastUploadStats, setLastUploadStats] = useState<UploadStats | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [forceReimport, setForceReimport] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
        setSelectedFile(file);
      } else {
        toast({
          variant: "destructive",
          title: "Invalid File Type",
          description: "Please upload an Excel file (.xlsx or .xls)",
        });
      }
    }
  }, [toast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
        setSelectedFile(file);
      } else {
        toast({
          variant: "destructive",
          title: "Invalid File Type",
          description: "Please upload an Excel file (.xlsx or .xls)",
        });
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast({
        variant: "destructive",
        title: "No File Selected",
        description: "Please select an Excel file to upload",
      });
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await axios.post<UploadResponse>(
        `${API_BASE_URL}/api/upload`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
          params: {
            force: forceReimport,
          },
        }
      );

      setLastUploadStats(response.data.stats);
      
      toast({
        variant: "success",
        title: "✅ Upload Successful!",
        description: (
          <div className="mt-2 space-y-1">
            <p className="font-semibold">{response.data.message}</p>
            <div className="text-sm mt-2 space-y-1">
              <p>📊 Processed: {response.data.stats.processed}</p>
              <p>✨ Inserted: {response.data.stats.inserted}</p>
              <p>🔄 Updated: {response.data.stats.updated}</p>
              <p>🗑️ Deleted: {response.data.stats.deleted}</p>
              <p>⏸️ Unchanged: {response.data.stats.unchanged}</p>
            </div>
          </div>
        ),
      });

      // Clear the selected file after successful upload
      setSelectedFile(null);
      setForceReimport(false); // Reset force flag
      // Reset file input to allow re-selecting the same file
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error: unknown) {
      console.error("Upload error:", error);
      
      const isAxiosError = error && typeof error === 'object' && 'response' in error;
      const errorResponse = isAxiosError ? (error as { response?: { status?: number; data?: { detail?: string } } }).response : undefined;
      
      if (errorResponse?.status === 409) {
        toast({
          variant: "destructive",
          title: "File Already Imported",
          description: (
            <div className="space-y-2">
              <p>{errorResponse.data?.detail || "This file has already been imported"}</p>
              <p className="text-sm font-semibold">💡 Tip: Check &ldquo;Force Re-import&rdquo; below to re-import this file</p>
            </div>
          ),
        });
      } else {
        const errorMessage = errorResponse?.data?.detail || (error instanceof Error ? error.message : 'An error occurred while uploading the file');
        toast({
          variant: "destructive",
          title: "Upload Failed",
          description: errorMessage,
        });
      }
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload Card */}
      <Card className="bg-white/5 backdrop-blur-xl border-white/10 shadow-2xl">
        <CardHeader>
          <CardTitle className="text-2xl text-white">Upload Excel File</CardTitle>
          <CardDescription className="text-slate-400">
            Upload your Excel export to sync with the database
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Drag and Drop Area */}
            <div
              className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-all ${
                dragActive
                  ? "border-blue-400 bg-blue-500/10"
                  : "border-white/20 bg-white/5 hover:border-white/30"
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <Input
                id="file-upload"
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                disabled={isUploading}
                className="hidden"
              />
              
              <label
                htmlFor="file-upload"
                className="cursor-pointer flex flex-col items-center space-y-4"
              >
                {selectedFile ? (
                  <FileSpreadsheet className="w-16 h-16 text-green-400" />
                ) : (
                  <Upload className="w-16 h-16 text-slate-400" />
                )}
                
                <div className="space-y-2">
                  {selectedFile ? (
                    <>
                      <p className="text-lg font-semibold text-green-400">
                        {selectedFile.name}
                      </p>
                      <p className="text-sm text-slate-400">
                        {(selectedFile.size / 1024).toFixed(2)} KB
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-lg font-semibold text-white">
                        Drop your Excel file here
                      </p>
                      <p className="text-sm text-slate-400">
                        or click to browse
                      </p>
                    </>
                  )}
                </div>
              </label>
            </div>

            {/* Force Re-import Checkbox */}
            <div className="flex items-center space-x-3 px-1">
              <input
                type="checkbox"
                id="force-reimport"
                checked={forceReimport}
                onChange={(e) => setForceReimport(e.target.checked)}
                disabled={isUploading}
                className="h-4 w-4 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500 cursor-pointer"
              />
              <label
                htmlFor="force-reimport"
                className="text-sm text-slate-400 cursor-pointer"
              >
                Force re-import
              </label>
            </div>

            {/* Upload Button */}
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || isUploading}
              className="w-full h-12 text-base bg-blue-600 hover:bg-blue-500 transition-colors"
              size="lg"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-5 w-5" />
                  Upload & Sync
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats Card - Only show if there are stats */}
      {lastUploadStats && (
        <Card className="bg-white/5 backdrop-blur-xl border-white/10 shadow-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-green-400" />
              <span className="text-white">Last Upload</span>
            </CardTitle>
            <CardDescription className="text-slate-400">
              Summary of the most recent sync
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatItem
                label="Processed"
                value={lastUploadStats.processed}
                icon="📊"
              />
              <StatItem
                label="Inserted"
                value={lastUploadStats.inserted}
                icon="✨"
              />
              <StatItem
                label="Updated"
                value={lastUploadStats.updated}
                icon="🔄"
              />
              <StatItem
                label="Deleted"
                value={lastUploadStats.deleted}
                icon="🗑️"
              />
              <StatItem
                label="Unchanged"
                value={lastUploadStats.unchanged}
                icon="⏸️"
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface StatItemProps {
  label: string;
  value: number;
  icon: string;
}

function StatItem({ label, value, icon }: StatItemProps) {
  return (
    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{icon}</span>
        <p className="text-xs text-slate-400 uppercase">{label}</p>
      </div>
      <p className="text-3xl font-bold text-white">{value}</p>
    </div>
  );
}
