import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import "./styles/index.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Minimal test - just show a loading screen
const SimpleApp = () => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      backgroundColor: "#111827",
      color: "white",
      flexDirection: "column",
    }}
  >
    <h1>LedgerSync</h1>
    <p>Loading application...</p>
    <p style={{ fontSize: "12px", color: "#9ca3af", marginTop: "20px" }}>
      If this page does not update, there may be a module loading issue.
    </p>
  </div>
);

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

const root = ReactDOM.createRoot(rootElement);

// Shared QueryClient instance
const queryClient = new QueryClient();
root.render(
  <StrictMode>
    <SimpleApp />
  </StrictMode>
);

// Try to load the full App asynchronously
setTimeout(async () => {
  try {
    console.log("Attempting to load full App...");
    const { default: App } = await import("./app/App");
    const { EnhancedErrorBoundary, LoadingSpinner } = await import("@/components");
    const { createBrowserRouter, RouterProvider } = await import("react-router-dom");
    const { Suspense } = await import("react");

    const router = createBrowserRouter([
      {
        path: "/",
        element: (
          <EnhancedErrorBoundary>
            <App />
          </EnhancedErrorBoundary>
        ),
        errorElement: (
          <EnhancedErrorBoundary>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "100vh",
                backgroundColor: "#111827",
                color: "white",
                flexDirection: "column",
              }}
            >
              <h1>404 - Page Not Found</h1>
              <a href="/" style={{ color: "#3b82f6", marginTop: "20px" }}>
                Go back home
              </a>
            </div>
          </EnhancedErrorBoundary>
        ),
      },
    ]);

    root.render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <Suspense fallback={<LoadingSpinner />}>
            <RouterProvider router={router} />
          </Suspense>
        </QueryClientProvider>
      </StrictMode>
    );
    console.log("Full App loaded successfully!");
  } catch (error) {
    console.error("Failed to load App:", error);
    root.render(
      <StrictMode>
        <div
          style={{
            padding: "20px",
            color: "white",
            backgroundColor: "#111827",
            minHeight: "100vh",
          }}
        >
          <h1 style={{ color: "#ef4444" }}>Error Loading Application</h1>
          <pre style={{ color: "#9ca3af", overflow: "auto" }}>{String(error)}</pre>
        </div>
      </StrictMode>
    );
  }
}, 100);
