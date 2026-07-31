import DataShell from "@/components/DataShell";
import AnalyticsDashboard from "@/components/AnalyticsDashboard";

export default function Page() {
  return (
    <DataShell>
      <AnalyticsDashboard embedded />
    </DataShell>
  );
}
