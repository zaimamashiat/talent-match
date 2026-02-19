import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle } from "lucide-react";

interface SkillTagProps {
  skill: string;
  matched?: boolean;
  size?: "sm" | "md";
}

export function SkillTag({ skill, matched = true, size = "sm" }: SkillTagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium capitalize transition-all",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs",
        matched
          ? "bg-green-50 border-green-200 text-green-700"
          : "bg-red-50 border-red-200 text-red-600"
      )}
    >
      {matched
        ? <CheckCircle2 className="w-3 h-3 shrink-0" />
        : <XCircle className="w-3 h-3 shrink-0" />}
      {skill}
    </span>
  );
}
