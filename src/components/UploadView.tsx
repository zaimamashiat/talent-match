import { useState } from "react";
import { Upload, FileText, CheckCircle2, Loader2, X } from "lucide-react";

interface UploadFile {
  name: string;
  size: string;
  status: "pending" | "processing" | "done" | "error";
  type: "jd" | "cv";
}

export function UploadView() {
  const [jdFiles, setJdFiles] = useState<UploadFile[]>([]);
  const [cvFile, setCvFile] = useState<UploadFile | null>(null);
  const [isDragging, setIsDragging] = useState<"jd" | "cv" | null>(null);

  const handleDrop = (e: React.DragEvent, type: "jd" | "cv") => {
    e.preventDefault();
    setIsDragging(null);
    const files = Array.from(e.dataTransfer.files);
    addFiles(files, type);
  };

  const addFiles = (files: File[], type: "jd" | "cv") => {
    const newFiles = files.map(f => ({
      name: f.name,
      size: (f.size / 1024).toFixed(1) + " KB",
      status: "pending" as const,
      type,
    }));
    if (type === "jd") setJdFiles(prev => [...prev, ...newFiles]);
    else setCvFile(newFiles[0] ?? null);
  };

  const simulateProcess = () => {
    const process = (files: UploadFile[], setter: (f: UploadFile[]) => void) => {
      const updated = files.map(f => ({ ...f, status: "processing" as const }));
      setter(updated);
      setTimeout(() => {
        setter(updated.map(f => ({ ...f, status: "done" as const })));
      }, 2000);
    };

    if (jdFiles.length) process(jdFiles, setJdFiles);
    if (cvFile) {
      setCvFile({ ...cvFile, status: "processing" });
      setTimeout(() => setCvFile(prev => prev ? { ...prev, status: "done" } : null), 2000);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-bold text-foreground">Upload Pipeline Files</h2>
        <p className="text-sm text-muted-foreground">Upload Job Description PDFs and the CV data CSV to run the screening pipeline.</p>
      </div>

      {/* JD Upload */}
      <div>
        <label className="block text-sm font-semibold text-foreground mb-2">Job Description PDFs</label>
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging("jd"); }}
          onDragLeave={() => setIsDragging(null)}
          onDrop={e => handleDrop(e, "jd")}
          className={`rounded-xl border-2 border-dashed p-8 text-center transition-all ${
            isDragging === "jd" ? "border-teal bg-teal-50/50" : "border-border hover:border-primary/40 bg-muted/20"
          }`}
        >
          <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Drag & drop JD PDFs here</p>
          <p className="text-xs text-muted-foreground mt-1">or</p>
          <label className="mt-3 inline-block">
            <input
              type="file" multiple accept=".pdf" className="hidden"
              onChange={e => addFiles(Array.from(e.target.files || []), "jd")}
            />
            <span className="px-4 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90 transition-colors">
              Browse Files
            </span>
          </label>
        </div>

        {jdFiles.length > 0 && (
          <div className="mt-3 space-y-2">
            {jdFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-lg border bg-card">
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm flex-1 truncate">{f.name}</span>
                <span className="text-xs text-muted-foreground">{f.size}</span>
                {f.status === "processing" && <Loader2 className="w-4 h-4 animate-spin text-teal" />}
                {f.status === "done" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                {f.status === "pending" && (
                  <button onClick={() => setJdFiles(prev => prev.filter((_, j) => j !== i))}>
                    <X className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CV Upload */}
      <div>
        <label className="block text-sm font-semibold text-foreground mb-2">CV Data CSV</label>
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging("cv"); }}
          onDragLeave={() => setIsDragging(null)}
          onDrop={e => handleDrop(e, "cv")}
          className={`rounded-xl border-2 border-dashed p-8 text-center transition-all ${
            isDragging === "cv" ? "border-teal bg-teal-50/50" : "border-border hover:border-primary/40 bg-muted/20"
          }`}
        >
          <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Drag & drop CV CSV here</p>
          <p className="text-xs text-muted-foreground mt-1">cv_list.csv format</p>
          <label className="mt-3 inline-block">
            <input
              type="file" accept=".csv" className="hidden"
              onChange={e => addFiles(Array.from(e.target.files || []), "cv")}
            />
            <span className="px-4 py-2 text-xs font-medium rounded-lg bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90 transition-colors">
              Browse File
            </span>
          </label>
        </div>

        {cvFile && (
          <div className="mt-3 flex items-center gap-3 px-4 py-2.5 rounded-lg border bg-card">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm flex-1 truncate">{cvFile.name}</span>
            <span className="text-xs text-muted-foreground">{cvFile.size}</span>
            {cvFile.status === "processing" && <Loader2 className="w-4 h-4 animate-spin text-teal" />}
            {cvFile.status === "done" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
          </div>
        )}
      </div>

      {/* Process Button */}
      <button
        onClick={simulateProcess}
        disabled={jdFiles.length === 0 && !cvFile}
        className="px-6 py-2.5 text-sm font-semibold rounded-lg teal-gradient text-white shadow-teal hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Run Screening Pipeline
      </button>

      {/* Pipeline Steps */}
      <div className="rounded-xl border bg-card shadow-card p-5">
        <p className="text-sm font-semibold text-foreground mb-4">Pipeline Steps</p>
        <div className="space-y-3">
          {[
            { step: "1", label: "PDF Text Extraction", desc: "Extract text from JD PDFs using pdfplumber" },
            { step: "2", label: "LLM Structured Extraction", desc: "Parse JD fields (Title, Skills, Tech) via Groq LLaMA" },
            { step: "3", label: "CV Loading & Portfolio Scraping", desc: "Load CSV data + scrape GitHub/websites" },
            { step: "4", label: "Semantic Embedding", desc: "SBERT all-mpnet-base-v2 → 384-dim vectors" },
            { step: "5", label: "Fuzzy Skill Matching", desc: "RapidFuzz skill-by-skill matching at 80% threshold" },
            { step: "6", label: "Category Classification", desc: "BERT-based resume category prediction" },
            { step: "7", label: "Ranking & Export", desc: "Rank by Tech Match %, export JSON per JD" },
          ].map(({ step, label, desc }) => (
            <div key={step} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full teal-gradient flex items-center justify-center text-[11px] font-bold text-white shrink-0 mt-0.5">
                {step}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
