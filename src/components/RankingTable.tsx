import { useState } from "react";
import { Candidate } from "@/data/mockData";
import { ScoreBadge } from "./ScoreBadge";
import { SkillTag } from "./SkillTag";
import { CandidateModal } from "./CandidateModal";
import { Badge } from "@/components/ui/badge";
import { ChevronUp, ChevronDown, ExternalLink, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

interface RankingTableProps {
  candidates: Candidate[];
  jdTitle: string;
}

type SortKey = "Rank" | "Tech_Match (%)" | "Semantic_Match (%)";

export function RankingTable({ candidates, jdTitle }: RankingTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("Rank");
  const [sortAsc, setSortAsc] = useState(true);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [filter, setFilter] = useState("");

  const sorted = [...candidates]
    .filter(c =>
      c.Name?.toLowerCase().includes(filter.toLowerCase()) ||
      c.Category?.toLowerCase().includes(filter.toLowerCase())
    )
    .sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortAsc ? av - bv : bv - av;
    });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === "Rank"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col
      ? sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
      : <ChevronUp className="w-3 h-3 opacity-30" />;

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Filter candidates..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="flex-1 max-w-xs px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-sm text-muted-foreground">{sorted.length} candidates</span>
        </div>

        <div className="rounded-xl border overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide w-12">
                    <button className="flex items-center gap-1" onClick={() => toggleSort("Rank")}>
                      Rank <SortIcon col="Rank" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Candidate</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Category</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                    <button className="flex items-center gap-1" onClick={() => toggleSort("Tech_Match (%)")}>
                      Tech Match <SortIcon col="Tech_Match (%)" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                    <button className="flex items-center gap-1" onClick={() => toggleSort("Semantic_Match (%)")}>
                      Semantic <SortIcon col="Semantic_Match (%)" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Skills Preview</th>
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sorted.map((c, i) => (
                  <tr
                    key={c.Candidate_ID}
                    className={cn(
                      "hover:bg-muted/30 transition-colors cursor-pointer group",
                      i === 0 && "bg-amber-50/50"
                    )}
                    onClick={() => setSelected(c)}
                  >
                    <td className="px-4 py-3">
                      <div className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
                        c.Rank === 1 ? "bg-amber-400 text-amber-900" :
                        c.Rank === 2 ? "bg-slate-200 text-slate-700" :
                        c.Rank === 3 ? "bg-orange-200 text-orange-800" :
                        "bg-muted text-muted-foreground"
                      )}>
                        {c.Rank}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs shrink-0">
                          {c.Name?.split(" ").map(n => n[0]).join("").slice(0,2)}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{c.Name}</p>
                          <p className="text-xs text-muted-foreground">{c.Email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className="text-xs font-medium">{c.Category}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <ScoreBadge score={c["Tech_Match (%)"]} showBar />
                    </td>
                    <td className="px-4 py-3">
                      <ScoreBadge score={c["Semantic_Match (%)"]} showBar />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {c.Matched_Tech_Skills.slice(0, 3).map(s => (
                          <SkillTag key={s} skill={s} matched />
                        ))}
                        {c.Matched_Tech_Skills.length > 3 && (
                          <span className="text-[11px] text-muted-foreground px-1">+{c.Matched_Tech_Skills.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-xs text-teal font-medium"
                        onClick={e => { e.stopPropagation(); setSelected(c); }}
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

      <CandidateModal candidate={selected} jdTitle={jdTitle} onClose={() => setSelected(null)} />
    </>
  );
}
