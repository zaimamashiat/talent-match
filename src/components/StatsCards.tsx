import { FileText, Users, TrendingUp, Award, Clock, CheckCircle } from "lucide-react";
import { pipelineStats } from "@/data/mockData";

const stats = [
  {
    label: "Total Job Descriptions",
    value: pipelineStats.totalJDs,
    icon: FileText,
    suffix: "",
    desc: "Actively screening",
    color: "text-blue-600",
    bg: "bg-blue-50 border-blue-100",
  },
  {
    label: "Total Candidates",
    value: pipelineStats.totalCandidates,
    icon: Users,
    suffix: "",
    desc: "In pipeline",
    color: "text-purple-600",
    bg: "bg-purple-50 border-purple-100",
  },
  {
    label: "Avg. Tech Match",
    value: pipelineStats.avgTechMatch,
    icon: TrendingUp,
    suffix: "%",
    desc: "Across all JDs",
    color: "text-teal",
    bg: "bg-teal-50 border-teal-100",
  },
  {
    label: "Top Match Score",
    value: pipelineStats.topMatchScore,
    icon: Award,
    suffix: "%",
    desc: "Best candidate",
    color: "text-amber-600",
    bg: "bg-amber-50 border-amber-100",
  },
  {
    label: "Processed Today",
    value: pipelineStats.processedToday,
    icon: Clock,
    suffix: "",
    desc: "CVs screened",
    color: "text-indigo-600",
    bg: "bg-indigo-50 border-indigo-100",
  },
  {
    label: "Shortlisted",
    value: pipelineStats.shortlisted,
    icon: CheckCircle,
    suffix: "",
    desc: "Ready for review",
    color: "text-green-600",
    bg: "bg-green-50 border-green-100",
  },
];

export function StatsCards() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      {stats.map(({ label, value, icon: Icon, suffix, desc, color, bg }) => (
        <div
          key={label}
          className={`rounded-xl border p-4 card-gradient shadow-card flex flex-col gap-2`}
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
