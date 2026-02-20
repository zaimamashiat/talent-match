import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { rankCVs, extractJD } from "@/lib/api";
import type { ApiRankingResponse } from "@/lib/types";
import {
  FileText, FileSpreadsheet, Globe,
  Loader2, AlertCircle, CheckCircle2,
} from "lucide-react";

type Props = {
  onSubmit: (payload: {
    jdFile:            File;
    cvFile:            File;
    extractPortfolios: boolean;
    jdExtracted:       Record<string, any>;
    ranking:           ApiRankingResponse;
  }) => void;
  onCancel?: () => void;
};

// ── Stage definitions ────────────────────────────────────────────────────────
interface StageConfig {
  key:       string;
  label:     string;
  sublabel:  string;
  // Approximate % of total time this stage occupies (used to pace the bar)
  weight:    number;
}

const STAGES_NO_PORTFOLIO: StageConfig[] = [
  { key: "extracting-jd", label: "Extracting job description",    sublabel: "Parsing PDF with LLaMA...",           weight: 20 },
  { key: "ranking",       label: "Embedding & ranking candidates", sublabel: "BERT + SBERT + fuzzy matching...",    weight: 80 },
];

const STAGES_WITH_PORTFOLIO: StageConfig[] = [
  { key: "extracting-jd",       label: "Extracting job description",    sublabel: "Parsing PDF with LLaMA...",                    weight: 8  },
  { key: "ranking",             label: "Embedding & ranking candidates", sublabel: "BERT + SBERT + fuzzy matching...",             weight: 12 },
  { key: "scraping-portfolios", label: "Scraping portfolios",           sublabel: "GitHub · LinkedIn · websites via LLaMA...",    weight: 80 },
];

// ── Animated progress hook ───────────────────────────────────────────────────
/**
 * Drives a progress bar that:
 *  - Advances smoothly within each stage (never hits 100 until done)
 *  - Snaps to the start of the next stage when stageIndex increases
 *  - Jumps to 100 when done=true
 */
function useAnimatedProgress(
  stageIndex: number,
  stages: StageConfig[],
  done: boolean,
  running: boolean,
) {
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const stageStartPctRef = useRef<number>(0);

  // Compute cumulative % at the start of each stage
  const totalWeight = stages.reduce((s, st) => s + st.weight, 0);
  const stagePcts = stages.map((_, i) =>
    stages.slice(0, i).reduce((s, st) => s + st.weight, 0) / totalWeight * 100
  );
  const stageEndPcts = stages.map((_, i) =>
    stages.slice(0, i + 1).reduce((s, st) => s + st.weight, 0) / totalWeight * 100
  );

  useEffect(() => {
    if (done) { setProgress(100); return; }
    if (!running) { setProgress(0); return; }

    const stageStart = stagePcts[stageIndex]  ?? 0;
    const stageEnd   = stageEndPcts[stageIndex] ?? 100;
    // Leave a 3% buffer so it never reaches the next stage prematurely
    const stageMax   = stageEnd - 3;

    stageStartPctRef.current = stageStart;
    startRef.current = performance.now();

    // Each stage animates over an estimated duration
    const STAGE_DURATIONS_MS = running
      ? stages.map((st) => (st.weight / 100) * (stages === STAGES_WITH_PORTFOLIO ? 180_000 : 30_000))
      : stages.map(() => 1000);
    const duration = STAGE_DURATIONS_MS[stageIndex] ?? 10_000;

    const animate = (now: number) => {
      const elapsed = now - startRef.current;
      const t = Math.min(elapsed / duration, 1);
      // Ease-out: fast start, slow finish — feels natural for variable server time
      const eased = 1 - Math.pow(1 - t, 2);
      const pct = stageStart + eased * (stageMax - stageStart);
      setProgress(Math.min(pct, stageMax));
      if (t < 1) rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [stageIndex, done, running]);

  return progress;
}

// ── Component ────────────────────────────────────────────────────────────────
export function UploadView({ onSubmit, onCancel }: Props) {
  const [jdFile, setJdFile]                       = useState<File | null>(null);
  const [cvFile, setCvFile]                       = useState<File | null>(null);
  const [extractPortfolios, setExtractPortfolios] = useState(false);
  const [stageIndex, setStageIndex]               = useState(0);
  const [isDone, setIsDone]                       = useState(false);
  const [candidateCount, setCandidateCount]       = useState<number | null>(null);

  const stages = extractPortfolios ? STAGES_WITH_PORTFOLIO : STAGES_NO_PORTFOLIO;
  const progress = useAnimatedProgress(stageIndex, stages, isDone, false /* updated below */);

  // Track whether mutation is running to feed into the hook
  const [isRunning, setIsRunning] = useState(false);
  const progressLive = useAnimatedProgress(stageIndex, stages, isDone, isRunning);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!jdFile) throw new Error("Please select a JD PDF");
      if (!cvFile) throw new Error("Please select a CV CSV");

      setIsRunning(true);
      setIsDone(false);
      setStageIndex(0);
      setCandidateCount(null);

      // Step 1 — extract JD
      const jdResp    = await extractJD(jdFile);
      const extracted = jdResp?.extracted ?? {};

      // Step 2 — rank (+ optional portfolio scraping happens server-side)
      setStageIndex(extractPortfolios ? 1 : 1);
      if (extractPortfolios) setStageIndex(2); // jump to scraping stage label

      const ranking = await rankCVs({ jdFile, cvFile, extractPortfolios });
      setCandidateCount(ranking.total_candidates);

      setIsDone(true);
      setIsRunning(false);
      return { extracted, ranking };
    },
    onSuccess: ({ extracted, ranking }) => {
      if (!jdFile || !cvFile) return;
      onSubmit({ jdFile, cvFile, extractPortfolios, jdExtracted: extracted, ranking });
    },
    onError: () => {
      setIsRunning(false);
      setIsDone(false);
      setStageIndex(0);
    },
  });

  const isPending      = mutation.isPending;
  const currentStage   = stages[Math.min(stageIndex, stages.length - 1)];
  const pct            = Math.round(progressLive);

  // Colour ramp: red → amber → green
  const barColor =
    pct < 33 ? "bg-blue-500" :
    pct < 66 ? "bg-teal-500" :
               "bg-green-500";

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Upload &amp; Rank</h2>
          <p className="text-sm text-muted-foreground">
            Upload a JD PDF and candidates CSV to generate AI-powered rankings
          </p>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={isPending}
            className="px-3 py-2 text-xs font-semibold rounded-lg bg-muted hover:bg-muted/80 disabled:opacity-50 transition-colors"
          >
            Back
          </button>
        )}
      </div>

      <div className="rounded-xl border bg-card shadow-card p-5 space-y-5">
        {/* JD file */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            Job Description (PDF)
          </label>
          <input
            type="file" accept="application/pdf" disabled={isPending}
            onChange={(e) => setJdFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-muted file:text-foreground hover:file:bg-muted/80 disabled:opacity-50"
          />
          {jdFile && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-green-500" /> {jdFile.name}
            </p>
          )}
        </div>

        {/* CSV file */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
            Candidates (CSV)
          </label>
          <input
            type="file" accept=".csv,text/csv" disabled={isPending}
            onChange={(e) => setCvFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-muted file:text-foreground hover:file:bg-muted/80 disabled:opacity-50"
          />
          {cvFile && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-green-500" /> {cvFile.name}
            </p>
          )}
        </div>

        {/* Portfolio toggle */}
        <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer select-none transition-colors ${
          extractPortfolios ? "bg-teal-50 border-teal-200" : "bg-muted/30 border-border"
        } ${isPending ? "opacity-50 pointer-events-none" : ""}`}>
          <input
            type="checkbox" checked={extractPortfolios}
            onChange={(e) => setExtractPortfolios(e.target.checked)}
            className="mt-0.5"
          />
          <div>
            <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" /> Scrape portfolio links
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Fetches GitHub repos, LinkedIn, and personal sites to detect extra skills.{" "}
              <span className="font-medium text-foreground">Adds ~2–3 min</span> for large batches.
            </p>
          </div>
        </label>

        {/* Submit */}
        <button
          onClick={() => mutation.mutate()}
          disabled={isPending || !jdFile || !cvFile}
          className="w-full px-4 py-2.5 text-sm font-semibold rounded-lg teal-gradient text-white shadow-teal hover:opacity-90 disabled:opacity-60 transition-opacity flex items-center justify-center gap-2"
        >
          {isPending
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
            : "Process & Rank Candidates"
          }
        </button>

        {/* ── Progress UI ────────────────────────────────────────────────── */}
        {isPending && (
          <div className="space-y-3">
            {/* Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">{currentStage?.label}</span>
                <span className="tabular-nums text-muted-foreground">{pct}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ease-out ${barColor}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">{currentStage?.sublabel}</p>
            </div>

            {/* Stage checklist */}
            <div className="rounded-lg bg-muted/40 border divide-y divide-border overflow-hidden">
              {stages.map((s, i) => {
                const done    = i < stageIndex || isDone;
                const active  = i === stageIndex && !isDone;
                const pending = i > stageIndex;
                return (
                  <div
                    key={s.key}
                    className={`flex items-center gap-3 px-3 py-2.5 text-xs transition-colors ${
                      done    ? "text-green-700 bg-green-50/60" :
                      active  ? "text-foreground bg-background font-medium" :
                                "text-muted-foreground"
                    }`}
                  >
                    {done ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    ) : active ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    ) : (
                      <span className="w-3.5 h-3.5 rounded-full border border-muted-foreground/40 shrink-0 inline-block" />
                    )}
                    <span className="flex-1">{s.label}</span>
                    {active && candidateCount !== null && (
                      <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                        {candidateCount} candidates
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Time estimate */}
            {extractPortfolios && stageIndex >= (stages.length - 1) && (
              <p className="text-[11px] text-muted-foreground text-center">
                Portfolio scraping takes ~2 sec per URL — grab a coffee ☕
              </p>
            )}
          </div>
        )}

        {/* Error */}
        {mutation.error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <pre className="whitespace-pre-wrap font-sans">
              {(mutation.error as Error).message}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}