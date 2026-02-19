import { JobDescription } from "@/data/mockData";
import { MapPin, Briefcase, GraduationCap, DollarSign, Users, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface JDCardProps {
  jd: JobDescription;
  isSelected: boolean;
  onSelect: () => void;
  candidateCount: number;
}

export function JDCard({ jd, isSelected, onSelect, candidateCount }: JDCardProps) {
  const techSkills = jd.Technology.split(",").map(s => s.trim()).filter(Boolean);

  return (
    <div
      onClick={onSelect}
      className={`rounded-xl border p-4 cursor-pointer transition-all duration-200 ${
        isSelected
          ? "border-teal bg-teal-50/50 shadow-teal ring-1 ring-teal/30"
          : "border-border bg-card hover:border-primary/30 hover:shadow-card shadow-card"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="font-semibold text-foreground text-sm leading-tight">{jd.Job_Title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{jd.Company}</p>
        </div>
        <ChevronRight className={`w-4 h-4 shrink-0 mt-0.5 transition-colors ${isSelected ? "text-teal" : "text-muted-foreground/40"}`} />
      </div>

      <div className="space-y-1.5 mb-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate">{jd.Location}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Briefcase className="w-3 h-3 shrink-0" />
          <span>{jd.Experience}</span>
        </div>
        {jd.Salary && (
          <div className="flex items-center gap-1.5">
            <DollarSign className="w-3 h-3 shrink-0" />
            <span className="truncate">{jd.Salary}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {techSkills.slice(0, 4).map(skill => (
          <Badge key={skill} variant="secondary" className="text-[10px] px-1.5 py-0 font-medium">{skill}</Badge>
        ))}
        {techSkills.length > 4 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">+{techSkills.length - 4}</Badge>
        )}
      </div>

      <div className="flex items-center justify-between pt-2.5 border-t border-border/60">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="w-3 h-3" />
          {candidateCount} candidates
        </span>
        <span className="text-[10px] text-muted-foreground">
          {new Date(jd.processedAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}
