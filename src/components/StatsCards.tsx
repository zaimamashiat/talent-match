import { FileText, Users, TrendingUp, Award, CheckCircle, BarChart2 } from "lucide-react";

interface StatsCardsProps {
  totalJDs:       number;
  totalCandidates: number;
  avgTechMatch:   number;
  topMatchScore:  number;
  shortlisted:    number;
  portfoliosScraped: number;
}

export function StatsCards({
  totalJDs        = 0,
  totalCandidates = 0,
  avgTechMatch    = 0,
  topMatchScore   = 0,
  shortlisted     = 0,
  portfoliosScraped = 0,
}: StatsCardsProps) {
  const stats = [
    {
      label: "Job Descriptions",
      value: totalJDs,
      suffix: "",
      desc: "Actively screening",
      icon: FileText,
      color: "text-blue-600",
      bg: "bg-blue-50 border-blue-100",
    },
    {
      label: "Total Candidates",
      value: totalCandidates,
      suffix: "",
      desc: "In pipeline",
      icon: Users,
      color: "text-purple-600",
      bg: "bg-purple-50 border-purple-100",
    },
    {
      label: "Avg. Tech Match",
      value: avgTechMatch.toFixed(1),
      suffix: "%",
      desc: "Across all JDs",
      icon: TrendingUp,
      color: "text-teal",
      bg: "bg-teal-50 border-teal-100",
    },
    {
      label: "Top Match Score",
      value: topMatchScore.toFixed(1),
      suffix: "%",
      desc: "Best candidate",
      icon: Award,
      color: "text-amber-600",
      bg: "bg-amber-50 border-amber-100",
    },
    {
      label: "Shortlisted",
      value: shortlisted,
      suffix: "",
      desc: "Tech match ≥ 70%",
      icon: CheckCircle,
      color: "text-green-600",
      bg: "bg-green-50 border-green-100",
    },
    {
      label: "Portfolios",
      value: portfoliosScraped,
      suffix: "",
      desc: "Scraped & analysed",
      icon: BarChart2,
      color: "text-indigo-600",
      bg: "bg-indigo-50 border-indigo-100",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      {stats.map(({ label, value, suffix, desc, icon: Icon, color, bg }) => (
        <div
          key={label}
          className="rounded-xl border p-4 card-gradient shadow-card flex flex-col gap-2"
        >
          <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${bg}`}>
            <Icon className={`w-4 h-4 ${color}`} />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">
              {value}{suffix}
            </p>
            <p className="text-xs font-medium text-foreground/80 leading-tight">{label}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}