import { mockCandidates, mockJDs } from "@/data/mockData";
import { RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, PieChart, Pie, Legend } from "recharts";

const COLORS = ["hsl(174,72%,40%)", "hsl(224,64%,40%)", "hsl(38,92%,50%)", "hsl(0,84%,60%)"];

export function AnalyticsView() {
  // Per-JD average tech match
  const jdMatchData = mockJDs.map(jd => {
    const candidates = mockCandidates[jd.id] || [];
    const avg = candidates.length
      ? candidates.reduce((s, c) => s + c["Tech_Match (%)"], 0) / candidates.length
      : 0;
    return { name: jd.Job_Title.split(" ").slice(0, 2).join(" "), avg: parseFloat(avg.toFixed(1)), count: candidates.length };
  });

  // Category distribution across all candidates
  const catMap: Record<string, number> = {};
  Object.values(mockCandidates).flat().forEach(c => {
    catMap[c.Category] = (catMap[c.Category] || 0) + 1;
  });
  const categoryData = Object.entries(catMap).map(([name, value]) => ({ name, value }));

  // Score distribution buckets
  const allCandidates = Object.values(mockCandidates).flat();
  const buckets = [
    { range: "0-25%", count: 0 }, { range: "25-50%", count: 0 },
    { range: "50-75%", count: 0 }, { range: "75-100%", count: 0 }
  ];
  allCandidates.forEach(c => {
    const s = c["Tech_Match (%)"];
    if (s < 25) buckets[0].count++;
    else if (s < 50) buckets[1].count++;
    else if (s < 75) buckets[2].count++;
    else buckets[3].count++;
  });

  const radarData = [
    { metric: "Tech Match", value: 68 },
    { metric: "Semantic", value: 74 },
    { metric: "Category Fit", value: 81 },
    { metric: "Portfolio", value: 62 },
    { metric: "Experience", value: 70 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">Pipeline Analytics</h2>
        <p className="text-sm text-muted-foreground">Aggregate insights across all job descriptions</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Avg Tech Match per JD */}
        <div className="col-span-1 md:col-span-2 rounded-xl border bg-card shadow-card p-5">
          <p className="text-sm font-semibold text-foreground mb-4">Avg. Tech Match % by Job Description</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={jdMatchData} barSize={40}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
              <Tooltip formatter={(v: number) => [`${v}%`, "Avg Match"]} />
              <Bar dataKey="avg" radius={[6, 6, 0, 0]}>
                {jdMatchData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Candidate Skills Radar */}
        <div className="rounded-xl border bg-card shadow-card p-5">
          <p className="text-sm font-semibold text-foreground mb-4">Avg. Candidate Profile</p>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="hsl(214,32%,88%)" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10 }} />
              <Radar dataKey="value" stroke="hsl(174,72%,40%)" fill="hsl(174,72%,40%)" fillOpacity={0.25} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Score Distribution */}
        <div className="rounded-xl border bg-card shadow-card p-5">
          <p className="text-sm font-semibold text-foreground mb-4">Tech Match Distribution</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={buckets} barSize={36}>
              <XAxis dataKey="range" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {buckets.map((b, i) => (
                  <Cell key={i} fill={
                    b.range.startsWith("75") ? "hsl(142,76%,36%)" :
                    b.range.startsWith("50") ? "hsl(38,92%,50%)" :
                    "hsl(0,84%,60%)"
                  } />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Category Pie */}
        <div className="col-span-1 md:col-span-2 rounded-xl border bg-card shadow-card p-5">
          <p className="text-sm font-semibold text-foreground mb-4">Candidate Categories</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={false}>
                {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
