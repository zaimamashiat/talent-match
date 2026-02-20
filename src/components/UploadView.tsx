import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { rankCVs, extractJD } from "@/lib/api";
import type { ApiRankingResponse } from "@/lib/types";

type Props = {
  onSubmit: (payload: {
    jdFile: File;
    cvFile: File;
    extractPortfolios: boolean;
    jdExtracted: Record<string, any>;
    ranking: ApiRankingResponse;
  }) => void;
  onCancel?: () => void;
};

export function UploadView({ onSubmit, onCancel }: Props) {
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [extractPortfolios, setExtractPortfolios] = useState<boolean>(false);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!jdFile) throw new Error("Please select a JD PDF");
      if (!cvFile) throw new Error("Please select a CV CSV");

      // 1) Extract JD
      const jdResp = await extractJD(jdFile);
      const extracted = jdResp?.extracted ?? {};

      // 2) Rank CVs
      const ranking = await rankCVs({ jdFile, cvFile, extractPortfolios });

      return { extracted, ranking };
    },
    onSuccess: ({ extracted, ranking }) => {
      if (!jdFile || !cvFile) return;
      onSubmit({ jdFile, cvFile, extractPortfolios, jdExtracted: extracted, ranking });
    },
  });

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Upload & Rank</h2>
          <p className="text-sm text-muted-foreground">Upload JD PDF + CV CSV to generate candidate rankings</p>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-3 py-2 text-xs font-semibold rounded-lg bg-muted hover:bg-muted/80"
          >
            Back
          </button>
        )}
      </div>

      <div className="rounded-xl border bg-card shadow-card p-5 space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground block">Job Description (PDF)</label>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setJdFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm"
          />
          {jdFile && <p className="text-xs text-muted-foreground">Selected: {jdFile.name}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-foreground block">CVs (CSV)</label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setCvFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm"
          />
          {cvFile && <p className="text-xs text-muted-foreground">Selected: {cvFile.name}</p>}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={extractPortfolios}
            onChange={(e) => setExtractPortfolios(e.target.checked)}
          />
          Extract portfolio links (slower)
        </label>

        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !jdFile || !cvFile}
          className="px-4 py-2 text-sm font-semibold rounded-lg teal-gradient text-white shadow-teal hover:opacity-90 disabled:opacity-60"
        >
          {mutation.isPending ? "Processing..." : "Process & Rank"}
        </button>

        {mutation.error && (
          <pre className="text-xs text-red-500 whitespace-pre-wrap">
            {(mutation.error as Error).message}
          </pre>
        )}
      </div>
    </div>
  );
}
