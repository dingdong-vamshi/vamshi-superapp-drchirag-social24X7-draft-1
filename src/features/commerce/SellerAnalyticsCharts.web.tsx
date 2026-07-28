import { Area, AreaChart, Bar, BarChart, CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SellerAnalytics } from "./shopRepository";

const green = "#0fa968";
const dataFallback = Array.from({ length: 14 }, (_, index) => ({ label: String(index + 1), views: 0, visitors: 0, orders: 0 }));

export default function SellerAnalyticsCharts({ analytics }: { analytics: SellerAnalytics | null }) {
  const series = analytics?.dailySeries ?? dataFallback;
  const payment = analytics?.paymentMix ?? [{ label: "Online", value: 0 }, { label: "Cash on delivery", value: 0 }];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 14, width: "100%" }}>
      <TremorCard title="Storefront visitors" value={String(analytics?.storefrontViews ?? 0)} note="Last 14 days">
        <ResponsiveContainer width="100%" height={176}><AreaChart data={series}><defs><linearGradient id="store-green" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={green} stopOpacity={0.32}/><stop offset="100%" stopColor={green} stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#edf1ef"/><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#82908a", fontSize: 10 }}/><YAxis hide/><Tooltip/><Area type="monotone" dataKey="views" stroke={green} strokeWidth={2.5} fill="url(#store-green)" /></AreaChart></ResponsiveContainer>
      </TremorCard>
      <TremorCard title="Orders placed" value={String(analytics?.ordersPlaced ?? 0)} note={`₹${((analytics?.revenuePaise ?? 0) / 100).toFixed(0)} revenue`}>
        <ResponsiveContainer width="100%" height={176}><BarChart data={series}><CartesianGrid vertical={false} stroke="#edf1ef"/><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#82908a", fontSize: 10 }}/><YAxis hide/><Tooltip/><Bar dataKey="orders" radius={[5,5,0,0]} fill="#2563eb" /></BarChart></ResponsiveContainer>
      </TremorCard>
      <TremorCard title="Payment mix" value={`${analytics?.conversionRate ?? 0}%`} note={`${analytics?.productViews ?? 0} product-detail views`}>
        <div style={{ height: 176, display:"flex", alignItems:"center", gap: 14 }}><ResponsiveContainer width="52%" height="100%"><PieChart><Pie data={payment} dataKey="value" nameKey="label" innerRadius={42} outerRadius={66} paddingAngle={4} fill={green} /></PieChart></ResponsiveContainer><div style={{ fontSize: 12, color: "#56655d", lineHeight: 1.9 }}>{payment.map((item, index) => <div key={item.label}><span style={{ color: index ? "#f4b33f" : green }}>●</span> {item.label}<b style={{ marginLeft: 6, color: "#17211b" }}>{item.value}</b></div>)}</div></div>
      </TremorCard>
    </div>
  );
}

function TremorCard({ title, value, note, children }: { title: string; value: string; note: string; children: React.ReactNode }) {
  return <section style={{ minWidth: 0, border: "1px solid #e4ebe7", borderRadius: 14, padding: 16, background: "rgba(255,255,255,.8)", boxShadow: "0 10px 28px rgba(15, 65, 39, .05)" }}><div style={{ color: "#5b6962", fontSize: 12, fontWeight: 700 }}>{title}</div><div style={{ color: "#142019", marginTop: 8, fontSize: 26, fontWeight: 800, letterSpacing: "-.04em" }}>{value}</div><div style={{ color: "#87938d", fontSize: 11, marginTop: 4 }}>{note}</div>{children}</section>;
}
