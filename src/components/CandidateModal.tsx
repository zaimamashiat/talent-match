import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Candidate } from "@/data/mockData";
import { ScoreBadge } from "./ScoreBadge";
import { SkillTag } from "./SkillTag";
import { Badge } from "@/components/ui/badge";
import { Mail, MapPin, Briefcase, ExternalLink, Award, Brain } from "lucide-react";

interface CandidateModalProps {
  candidate: Candidate | null;
  jdTitle: string;
  onClose: () => void;
}

export function CandidateModal({ candidate, jdTitle, onClose }: CandidateModalProps) {
  if (!candidate) return null;

  const techMatch = candidate["Tech_Match (%)"];
  const semMatch = candidate["Semantic_Match (%)"];
  const overallScore = ((techMatch * 0.6) + (semMatch * 0.4));

  return (
    <Dialog open={!!candidate} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
              {candidate.Name?.split(" ").map(n => n[0]).join("").slice(0, 2)}
            </div>
            <div>
              <p className="text-base font-semibold">{candidate.Name}</p>
              <p className="text-xs text-muted-foreground font-normal">Ranked #{candidate.Rank} for {jdTitle}</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Info Row */}
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{candidate.Email}</span>
            {candidate.Location && <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{candidate.Location}</span>}
            {candidate.Experience_Years && <span className="flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" />{candidate.Experience_Years} yrs exp</span>}
            {candidate.Portfolio_URL && (
              <a href={candidate.Portfolio_URL} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-teal hover:underline">
                <ExternalLink className="w-3.5 h-3.5" />{candidate.Portfolio_Type}
              </a>
            )}
          </div>

          {/* Category */}
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="flex items-center gap-1.5">
              <Brain className="w-3 h-3" />
              {candidate.Category}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Confidence: {(candidate.Category_Confidence * 100).toFixed(1)}%
            </span>
          </div>

          {/* Scores */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Tech Match", score: techMatch, icon: "⚙️" },
              { label: "Semantic Match", score: semMatch, icon: "🧠" },
              { label: "Overall Score", score: overallScore, icon: "🏆" },
            ].map(({ label, score, icon }) => (
              <div key={label} className="rounded-xl border bg-muted/30 p-4 text-center">
                <div className="text-xl mb-1">{icon}</div>
                <p className="text-2xl font-bold text-foreground">{score.toFixed(1)}<span className="text-sm font-normal text-muted-foreground">%</span></p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
                <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${score >= 75 ? "bg-green-500" : score >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                    style={{ width: `${Math.min(score, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Matched Skills */}
          {candidate.Matched_Tech_Skills.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <Award className="w-4 h-4 text-green-500" />
                Matched Skills ({candidate.Matched_Tech_Skills.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {candidate.Matched_Tech_Skills.map(skill => (
                  <SkillTag key={skill} skill={skill} matched size="md" />
                ))}
              </div>
            </div>
          )}

          {/* Missing Skills */}
          {candidate.Missing_Tech_Skills.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <Award className="w-4 h-4 text-red-500" />
                Missing Skills ({candidate.Missing_Tech_Skills.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {candidate.Missing_Tech_Skills.map(skill => (
                  <SkillTag key={skill} skill={skill} matched={false} size="md" />
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
