import { getDashboardData, getDoneItems } from "@/lib/data/dashboard";
import Dashboard from "@/app/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [{ data, error }, doneItems] = await Promise.all([
    getDashboardData(),
    getDoneItems(),
  ]);

  if (error || !data) {
    return (
      <main
        style={{
          maxWidth: 640,
          margin: "0 auto",
          padding: "80px 24px",
          textAlign: "center",
        }}
      >
        <p style={{ color: "oklch(0.55 0 0)", fontSize: 14 }}>
          {error ?? "No synthesis results found."}
        </p>
      </main>
    );
  }

  const weekLabel = new Date(data.generated_at ?? data.week_of + "T12:00:00Z").toLocaleDateString(
    "en-US",
    { month: "long", day: "numeric", year: "numeric" }
  );

  return (
    <main className="dashboard-main">
      <Dashboard data={data} initialDoneItems={doneItems} weekLabel={weekLabel} />
      <footer
        style={{
          marginTop: 56,
          paddingTop: 20,
          borderTop: "1px solid oklch(1 0 0 / 0.08)",
          fontSize: 11,
          color: "oklch(0.45 0 0)",
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <span>FutureFit Signals</span>
      </footer>
    </main>
  );
}
