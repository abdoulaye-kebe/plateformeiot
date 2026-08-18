import AppShell from "@/components/AppShell";
import ErrorBoundary from "@/components/ErrorBoundary";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <ErrorBoundary label="Page">{children}</ErrorBoundary>
    </AppShell>
  );
}
