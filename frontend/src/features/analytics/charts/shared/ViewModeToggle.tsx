/**
 * ViewModeToggle - Reusable view mode selector
 * Switches between different time periods (month/year/decade) and data modes
 */

import type React from "react";

interface ViewModeToggleProps {
  viewMode: string;
  onViewModeChange: (mode: string) => void;
  modes?: Array<{ value: string; label: string }>;
  className?: string;
}

export const ViewModeToggle: React.FC<ViewModeToggleProps> = ({
  viewMode,
  onViewModeChange,
  modes = [
    { value: "month", label: "Month" },
    { value: "year", label: "Year" },
    { value: "decade", label: "Decade" },
  ],
  className = "",
}) => {
  return (
    <div className={`flex gap-2 ${className}`}>
      {modes.map((mode) => (
        <button
          key={mode.value}
          type="button"
          onClick={() => onViewModeChange(mode.value)}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            viewMode === mode.value
              ? "bg-blue-600 text-white shadow-lg"
              : "bg-gray-700/50 text-gray-300 hover:bg-gray-600"
          }`}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
};

interface DataModeToggleProps {
  dataMode: string;
  onDataModeChange: (mode: string) => void;
  className?: string;
}

export const DataModeToggle: React.FC<DataModeToggleProps> = ({
  dataMode,
  onDataModeChange,
  className = "",
}) => {
  return (
    <div className={`flex gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => onDataModeChange("regular")}
        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
          dataMode === "regular"
            ? "bg-purple-600 text-white shadow-lg"
            : "bg-gray-700/50 text-gray-300 hover:bg-gray-600"
        }`}
      >
        Regular
      </button>
      <button
        type="button"
        onClick={() => onDataModeChange("cumulative")}
        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
          dataMode === "cumulative"
            ? "bg-purple-600 text-white shadow-lg"
            : "bg-gray-700/50 text-gray-300 hover:bg-gray-600"
        }`}
      >
        Cumulative
      </button>
    </div>
  );
};
