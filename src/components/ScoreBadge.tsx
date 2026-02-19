import { cn } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number;
  className?: string;
  showBar?: boolean;
}

function getScoreStyle(score: number) {
  if (score >= 75) return { label: "High", color: "score-high", bg: "bg-score-high" };
  if (score >= 50) return { label: "Mid", color: "score-mid", bg: "bg-score-mid" };
  return { label: "Low", color: "score-low", bg: "bg-score-low" };
}

export function ScoreBadge({ score, className, showBar = false }: ScoreBadgeProps) {
  const { color, bg } = getScoreStyle(score);

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-semibold", bg)}>
        <span className={cn("w-1.5 h-1.5 rounded-full", {
          "bg-green-500": score >= 75,
          "bg-amber-500": score >= 50 && score < 75,
          "bg-red-500": score < 50,
        })} />
        <span className={color}>{score.toFixed(1)}%</span>
      </div>
      {showBar && (
        <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", {
              "bg-green-500": score >= 75,
              "bg-amber-500": score >= 50 && score < 75,
              "bg-red-500": score < 50,
            })}
            style={{ width: `${Math.min(score, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
