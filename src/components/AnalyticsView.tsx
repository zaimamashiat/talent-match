import { useEffect, useState } from "react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  PieChart, Pie, Legend, ScatterChart, Scatter, ZAxis,
} from "recharts";

// ─── Types from main.py /rank-cvs response ────────────────────────────────
interface CVRankEntry {
  rank: number;
  candidate_id: string;
  candidate_name?: string;
  candidate_email?: string;
  category: string;
  category_confidence: number;
  semantic_match_pct: number;
  tech_match_pct: number;
  matched_skills: string[];
  missing_skills: string[];
  portfolio_url?: string;
  portfolio_type?: string;
  portfolio_summary?: string;
  portfolio_skills?: string[];
}

interface RankingResponse {
  jd_title?: string;
  jd_skills: string[];
  total_candidates: number;
  portfolios_scraped: number;
  semantic_weight: number;
  tech_weight: number;
  rankings: CVRankEntry[];
}

// ─── Color palette aligned with main.py CATEGORIES ────────────────────────
const PALETTE = [
  "#14b8a6", "#3b82f6", "#f59e0b", "#ef4444",
  "#8b5cf6", "#10b981", "#f97316", "#06b6d4",
  "#ec4899", "#84cc16",
];

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

// ─── Custom Tooltip ────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card/95 backdrop-blur px-3 py-2 shadow-lg text-xs">
      {label && <p className="font-semibold text-foreground mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color ?? p.fill }}>
          {p.name}: <span className="font-bold">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

// ─── Stat Card ─────────────────────────────────────────────────────────────
function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card shadow-card p-5 flex flex-col gap-1">
      <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">{label}</p>
      <p className="text-3xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── Section wrapper ───────────────────────────────────────────────────────
function ChartCard({ title, children, span = 1 }: { title: string; children: React.ReactNode; span?: number }) {
  return (
    <div className={`rounded-xl border bg-card shadow-card p-5 col-span-1 ${span === 2 ? "md:col-span-2" : ""}`}>
      <p className="text-sm font-semibold text-foreground mb-4">{title}</p>
      {children}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
export function AnalyticsView({ rankingData }: { rankingData?: RankingResponse }) {
  // If no data prop passed, attempt to load from API health + a stored result
  const [data, setData] = useState<RankingResponse | null>(rankingData ?? null);
  const [loading, setLoading] = useState(!rankingData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (rankingData) { setData(rankingData); setLoading(false); return; }

    // Try to fetch last ranking from session storage (set by rank-cvs call elsewhere)
    const cached = sessionStorage.getItem("last_ranking_response");
    if (cached) {
      try { setData(JSON.parse(cached)); setLoading(false); return; } catch {}
    }

    // Fallback: hit health to confirm API is up, then surface message
    fetch(`${API_BASE}/health`)
      .then(r => r.json())
      .then(() => {
        setError("No ranking data yet. Upload a JD + CV sheet and run a ranking first.");
      })
      .catch(() => {
        setError(`Cannot reach API at ${API_BASE}. Make sure uvicorn is running.`);
      })
      .finally(() => setLoading(false));
  }, [rankingData]);

  // ── Loading / Error states ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm animate-pulse">
        Loading analytics…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
        <p className="text-muted-foreground text-sm max-w-md">{error ?? "No data available."}</p>
        <p className="text-xs text-muted-foreground/60">
          Analytics populate automatically after a successful <code>/rank-cvs</code> call.
        </p>
      </div>
    );
  }

  const { rankings, jd_skills, jd_title, total_candidates, portfolios_scraped,
          semantic_weight, tech_weight } = data;

  // ── Derived metrics ──────────────────────────────────────────────────────

  // 1. Category distribution
  const catMap: Record<string, number> = {};
  rankings.forEach(r => { catMap[r.category] = (catMap[r.category] || 0) + 1; });
  const categoryData = Object.entries(catMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // 2. Tech match score buckets
  const buckets = [
    { range: "0–25%", count: 0 },
    { range: "25–50%", count: 0 },
    { range: "50–75%", count: 0 },
    { range: "75–100%", count: 0 },
  ];
  rankings.forEach(r => {
    const s = r.tech_match_pct;
    if      (s < 25)  buckets[0].count++;
    else if (s < 50)  buckets[1].count++;
    else if (s < 75)  buckets[2].count++;
    else              buckets[3].count++;
  });

  // 3. Radar: avg scores across pipeline
  const avg = (fn: (r: CVRankEntry) => number) =>
    Math.round(rankings.reduce((s, r) => s + fn(r), 0) / rankings.length);

  const radarData = [
    { metric: "Tech Match",    value: avg(r => r.tech_match_pct) },
    { metric: "Semantic",      value: avg(r => r.semantic_match_pct) },
    { metric: "Cat. Fit",      value: avg(r => r.category_confidence * 100) },
  ];

  // 4. Top 8 candidates by total score
  const top8 = [...rankings]
    .slice(0, 8)
    .map(r => ({
      name: (r.candidate_name || r.candidate_email || r.candidate_id).split(" ")[0],
      tech:  parseFloat(r.tech_match_pct.toFixed(1)),
      sem:   parseFloat(r.semantic_match_pct.toFixed(1)),
    }));

  // 5. JD skill coverage: how many candidates matched each skill
  const skillCoverage = jd_skills.slice(0, 12).map(skill => ({
    skill: skill.length > 16 ? skill.slice(0, 14) + "…" : skill,
    fullSkill: skill,
    matched: rankings.filter(r => r.matched_skills.includes(skill)).length,
    missing: rankings.filter(r => r.missing_skills.includes(skill)).length,
  }));

  // 6. Scatter: semantic vs tech match
  const scatterData = rankings.map(r => ({
    x: parseFloat(r.semantic_match_pct.toFixed(1)),
    y: parseFloat(r.tech_match_pct.toFixed(1)),
    z: 60,
    name: r.candidate_name || r.candidate_id,
  }));

  // 7. Summary stats
  const avgTech = avg(r => r.tech_match_pct);
  const avgSem  = avg(r => r.semantic_match_pct);
  const portPct  = total_candidates > 0
    ? Math.round((portfolios_scraped / total_candidates) * 100)
    : 0;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-foreground">Pipeline Analytics</h2>
        <p className="text-sm text-muted-foreground">
          {jd_title ? `Role: ${jd_title} · ` : ""}
          {total_candidates} candidates · weights {Math.round(semantic_weight * 100)}% semantic / {Math.round(tech_weight * 100)}% tech
        </p>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Candidates"  value={total_candidates} />
        <StatCard label="Avg Tech Match"    value={`${avgTech}%`} />
        <StatCard label="Avg Semantic"      value={`${avgSem}%`} />
    
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

        {/* Top candidates by total score */}
        <ChartCard title="Top 8 Candidates — Total Score" span={2}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={top8} barSize={28} barGap={4}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="total" name="Total Score" radius={[5, 5, 0, 0]}>
                {top8.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Radar: avg candidate profile */}
        <ChartCard title="Avg. Candidate Profile">
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="hsl(214,32%,88%)" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10 }} />
              <Radar
                dataKey="value"
                stroke={PALETTE[0]}
                fill={PALETTE[0]}
                fillOpacity={0.25}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* JD skill coverage */}
        <ChartCard title={`JD Skill Coverage (${jd_skills.length} skills)`} span={2}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={skillCoverage} barSize={20} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 10 }} domain={[0, total_candidates]} />
              <YAxis type="category" dataKey="skill" tick={{ fontSize: 10 }} width={100} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="rounded-lg border border-border bg-card/95 px-3 py-2 shadow-lg text-xs">
                      <p className="font-semibold mb-1">{d.fullSkill}</p>
                      <p style={{ color: PALETTE[1] }}>Matched: {d.matched}</p>
                      <p style={{ color: PALETTE[3] }}>Missing: {d.missing}</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="matched" name="Matched" stackId="a" fill={PALETTE[0]} radius={[0, 0, 0, 0]} />
              <Bar dataKey="missing" name="Missing"  stackId="a" fill={PALETTE[3]} radius={[0, 4, 4, 0]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Candidate categories pie */}
        <ChartCard title="Candidate Categories">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={categoryData}
                dataKey="value"
                nameKey="name"
                cx="50%" cy="50%"
                outerRadius={80}
                label={({ name, percent }) =>
                  percent > 0.07 ? `${name.split(" ")[0]} ${(percent * 100).toFixed(0)}%` : ""
                }
                labelLine={false}
              >
                {categoryData.map((_, i) => (
                  <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Tech match distribution */}
        <ChartCard title="Tech Match Distribution">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={buckets} barSize={40}>
              <XAxis dataKey="range" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Candidates" radius={[6, 6, 0, 0]}>
                {buckets.map((b, i) => (
                  <Cell
                    key={i}
                    fill={
                      b.range.startsWith("75") ? "#10b981" :
                      b.range.startsWith("50") ? "#f59e0b" :
                      b.range.startsWith("25") ? "#f97316" : "#ef4444"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Semantic vs Tech Scatter */}
        <ChartCard title="Semantic vs Tech Match — All Candidates" span={2}>
          <ResponsiveContainer width="100%" height={220}>
            <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <XAxis
                type="number" dataKey="x" name="Semantic"
                domain={[0, 100]} unit="%" tick={{ fontSize: 10 }}
                label={{ value: "Semantic %", position: "insideBottom", offset: -4, fontSize: 10 }}
              />
              <YAxis
                type="number" dataKey="y" name="Tech"
                domain={[0, 100]} unit="%" tick={{ fontSize: 10 }}
                label={{ value: "Tech %", angle: -90, position: "insideLeft", fontSize: 10 }}
              />
              <ZAxis type="number" dataKey="z" range={[40, 40]} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="rounded-lg border border-border bg-card/95 px-3 py-2 shadow-lg text-xs">
                      <p className="font-semibold">{d.name}</p>
                      <p>Semantic: {d.x}%</p>
                      <p>Tech: {d.y}%</p>
                    </div>
                  );
                }}
              />
              <Scatter data={scatterData} fill={PALETTE[1]} fillOpacity={0.7} />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Missing skills leaderboard */}
        <ChartCard title="Most Frequently Missing Skills">
          {(() => {
            const missMap: Record<string, number> = {};
            rankings.forEach(r =>
              r.missing_skills.forEach(s => { missMap[s] = (missMap[s] || 0) + 1; })
            );
            const topMiss = Object.entries(missMap)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([skill, count]) => ({ skill: skill.length > 18 ? skill.slice(0, 16) + "…" : skill, count }));
            if (!topMiss.length)
              return <p className="text-xs text-muted-foreground">All JD skills are well-covered!</p>;
            return (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topMiss} barSize={20} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 10 }} domain={[0, total_candidates]} />
                  <YAxis type="category" dataKey="skill" tick={{ fontSize: 10 }} width={110} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="# Candidates Missing" fill={PALETTE[3]} radius={[0, 5, 5, 0]} />
                </BarChart>
              </ResponsiveContainer>
            );
          })()}
        </ChartCard>

      </div>
    </div>
  );
}