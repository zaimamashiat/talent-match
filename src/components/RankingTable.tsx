import { useState } from "react";
import { ScoreBadge } from "./ScoreBadge";
import { SkillTag } from "./SkillTag";
import { CandidateModal } from "./CandidateModal";
import { Badge } from "@/components/ui/badge";
import { ChevronUp, ChevronDown, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

// ── API response shape from /rank-cvs ────────────────────────────────────────
export interface ApiCandidate {
  rank:                 number;
  candidate_id:         string;
  candidate_name:       string | null;
  candidate_email:      string | null;
  candidate_phone:      string | null;
  cv_text:              string | null;
  raw_row:              Record<string, string> | null;
  category:             string;
  category_confidence:  number;
  semantic_match_pct:   number;
  tech_match_pct:       number;
  matched_skills:       string[];
  missing_skills:       string[];
  portfolio_url:        string | null;
  portfolio_type:       string | null;
  portfolio_summary:    string | null;
  portfolio_skills:     string[] | null;
  // convenience aliases set by mapApiCandidatesToTable in Index.tsx
  id?:    string;
  name?:  string;
  email?: string;
  phone?: string;
}

type SortKey = "rank" | "tech_match_pct" | "semantic_match_pct";

interface RankingTableProps {
  candidates: ApiCandidate[];
  jdTitle:    string;
}

export function RankingTable({ candidates, jdTitle }: RankingTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortAsc, setSortAsc]   = useState(true);
  const [selected, setSelected] = useState<ApiCandidate | null>(null);
  const [filter, setFilter]     = useState("");

  // Helper: resolve display name with fallback chain
  const displayName = (c: ApiCandidate) =>
    c.candidate_name?.trim() || c.candidate_email?.trim() || c.candidate_id;

  // Initials for avatar
  const initials = (c: ApiCandidate) => {
    const name = displayName(c);
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  };

  const sorted = [...candidates]
    .filter((c) => {
      const q = filter.toLowerCase();
      return (
        displayName(c).toLowerCase().includes(q) ||
        (c.category?.toLowerCase() ?? "").includes(q) ||
        (c.candidate_email?.toLowerCase() ?? "").includes(q)
      );
    })
    .sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortAsc ? av - bv : bv - av;
    });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === "rank"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col
      ? sortAsc
        ? <ChevronUp className="w-3 h-3" />
        : <ChevronDown className="w-3 h-3" />
      : <ChevronUp className="w-3 h-3 opacity-30" />;

  if (candidates.length === 0) {
    return (
      <div className="rounded-xl border bg-card shadow-card p-8 text-center">
        <p className="text-sm font-medium text-foreground">No candidates yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Upload a JD PDF and a candidates CSV to start ranking.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Filter bar */}
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Filter by name, email, or category..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="flex-1 max-w-xs px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-sm text-muted-foreground">
            {sorted.length} candidate{sorted.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Table */}
        <div className="rounded-xl border overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide w-14">
                    <button className="flex items-center gap-1" onClick={() => toggleSort("rank")}>
                      Rank <SortIcon col="rank" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                    Candidate
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                    Category
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                    <button className="flex items-center gap-1" onClick={() => toggleSort("tech_match_pct")}>
                      Tech Match <SortIcon col="tech_match_pct" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                    <button className="flex items-center gap-1" onClick={() => toggleSort("semantic_match_pct")}>
                      Semantic <SortIcon col="semantic_match_pct" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                    Matched Skills
                  </th>
                  <th className="px-4 py-3 w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sorted.map((c, i) => (
                  <tr
                    key={c.candidate_id}
                    className={cn(
                      "hover:bg-muted/30 transition-colors cursor-pointer group",
                      i === 0 && "bg-amber-50/50 dark:bg-amber-950/10"
                    )}
                    onClick={() => setSelected(c)}
                  >
                    {/* Rank badge */}
                    <td className="px-4 py-3">
                      <div className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
                        c.rank === 1 ? "bg-amber-400 text-amber-900" :
                        c.rank === 2 ? "bg-slate-200 text-slate-700"  :
                        c.rank === 3 ? "bg-orange-200 text-orange-800" :
                        "bg-muted text-muted-foreground"
                      )}>
                        {c.rank}
                      </div>
                    </td>

                    {/* Candidate name + email */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs shrink-0">
                          {initials(c)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate max-w-[160px]">
                            {displayName(c)}
                          </p>
                          <p className="text-xs text-muted-foreground truncate max-w-[160px]">
                            {c.candidate_email || c.candidate_id}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className="text-xs font-medium whitespace-nowrap">
                        {c.category}
                      </Badge>
                    </td>

                    {/* Tech match */}
                    <td className="px-4 py-3">
                      <ScoreBadge score={c.tech_match_pct} showBar />
                    </td>

                    {/* Semantic match */}
                    <td className="px-4 py-3">
                      <ScoreBadge score={c.semantic_match_pct} showBar />
                    </td>

                    {/* Matched skills preview */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {(c.matched_skills ?? []).slice(0, 3).map((s) => (
                          <SkillTag key={s} skill={s} matched />
                        ))}
                        {(c.matched_skills ?? []).length > 3 && (
                          <span className="text-[11px] text-muted-foreground px-1">
                            +{c.matched_skills.length - 3}
                          </span>
                        )}
                        {(c.matched_skills ?? []).length === 0 && (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>

                    {/* View button */}
                    <td className="px-4 py-3">
                      <button
                        className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs text-teal font-medium"
                        onClick={(e) => { e.stopPropagation(); setSelected(c); }}
                      >
                        <Eye className="w-3.5 h-3.5" /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <CandidateModal
        candidate={selected}
        jdTitle={jdTitle}
        onClose={() => setSelected(null)}
      />
    </>
  );
}