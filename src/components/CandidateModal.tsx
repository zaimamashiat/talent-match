import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScoreBadge } from "./ScoreBadge";
import { SkillTag } from "./SkillTag";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone, ExternalLink, Award, Brain } from "lucide-react";
import type { ApiCandidate } from "./RankingTable";

interface CandidateModalProps {
  candidate: ApiCandidate | null;
  jdTitle:   string;
  onClose:   () => void;
}

export function CandidateModal({ candidate, jdTitle, onClose }: CandidateModalProps) {
  if (!candidate) return null;

  const techMatch    = candidate.tech_match_pct     ?? 0;
  const semMatch     = candidate.semantic_match_pct ?? 0;
  const overallScore = techMatch * 0.6 + semMatch * 0.4;

  // Display name: name → email → id
  const displayName =
    candidate.candidate_name?.trim() ||
    candidate.candidate_email?.trim() ||
    candidate.candidate_id;

  // Initials for avatar
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Dialog open={!!candidate} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold truncate">{displayName}</p>
              <p className="text-xs text-muted-foreground font-normal">
                Ranked #{candidate.rank} for {jdTitle}
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Contact info row */}
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            {candidate.candidate_email && (
              <span className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" />
                {candidate.candidate_email}
              </span>
            )}
            {candidate.candidate_phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" />
                {candidate.candidate_phone}
              </span>
            )}
            {candidate.portfolio_url && (
              <a
                href={candidate.portfolio_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-teal hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {candidate.portfolio_type ?? "Portfolio"}
              </a>
            )}
          </div>

          {/* Category badge */}
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="flex items-center gap-1.5">
              <Brain className="w-3 h-3" />
              {candidate.category}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Confidence: {((candidate.category_confidence ?? 0) * 100).toFixed(1)}%
            </span>
          </div>

          {/* Score cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Tech Match",     score: techMatch,    icon: "⚙️" },
              { label: "Semantic Match", score: semMatch,     icon: "🧠" },
              { label: "Overall Score",  score: overallScore, icon: "🏆" },
            ].map(({ label, score, icon }) => (
              <div key={label} className="rounded-xl border bg-muted/30 p-4 text-center">
                <div className="text-xl mb-1">{icon}</div>
                <p className="text-2xl font-bold text-foreground">
                  {score.toFixed(1)}
                  <span className="text-sm font-normal text-muted-foreground">%</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
                <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      score >= 75 ? "bg-green-500" :
                      score >= 50 ? "bg-amber-500" : "bg-red-500"
                    }`}
                    style={{ width: `${Math.min(score, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Matched skills */}
          {(candidate.matched_skills ?? []).length > 0 && (
            <div>
              <p className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <Award className="w-4 h-4 text-green-500" />
                Matched Skills ({candidate.matched_skills.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {candidate.matched_skills.map((skill) => (
                  <SkillTag key={skill} skill={skill} matched />
                ))}
              </div>
            </div>
          )}

          {/* Missing skills */}
          {(candidate.missing_skills ?? []).length > 0 && (
            <div>
              <p className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <Award className="w-4 h-4 text-red-500" />
                Missing Skills ({candidate.missing_skills.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {candidate.missing_skills.map((skill) => (
                  <SkillTag key={skill} skill={skill} matched={false} />
                ))}
              </div>
            </div>
          )}

          {/* Portfolio summary (if scraped) */}
          {candidate.portfolio_summary && (
            <div className="rounded-xl border bg-muted/20 p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Portfolio Summary
              </p>
              <p className="text-sm text-foreground leading-relaxed">
                {candidate.portfolio_summary}
              </p>
              {(candidate.portfolio_skills ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {candidate.portfolio_skills!.map((s) => (
                    <SkillTag key={s} skill={s} matched size="sm" />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* CV text preview */}
          {candidate.cv_text && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Resume Preview
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed bg-muted/20 rounded-lg p-3 whitespace-pre-wrap max-h-40 overflow-y-auto">
                {candidate.cv_text}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}