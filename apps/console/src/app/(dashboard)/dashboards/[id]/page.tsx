import CustomDashboardView from "@/components/CustomDashboardView";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomDashboardView dashboardId={id} />;
}
