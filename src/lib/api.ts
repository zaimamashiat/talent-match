import type { ApiJDExtractResponse, ApiRankingResponse } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

async function mustJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function health() {
  const res = await fetch(`${API_BASE}/health`);
  return mustJson<{ status: string; models_loaded: boolean }>(res);
}

export async function extractJD(jdPdfFile: File) {
  const fd = new FormData();
  fd.append("file", jdPdfFile);

  const res = await fetch(`${API_BASE}/extract-jd`, { method: "POST", body: fd });
  return mustJson<ApiJDExtractResponse>(res);
}

export async function rankCVs(p0: File, cvFile: File, extractPortfolios: boolean, args: {
  jdFile: File;
  cvFile: File;
  extractPortfolios: boolean;
}) {
  const fd = new FormData();
  fd.append("jd_file", args.jdFile);
  fd.append("cv_file", args.cvFile);
  fd.append("extract_portfolios", String(args.extractPortfolios));

  const res = await fetch(`${API_BASE}/rank-cvs`, { method: "POST", body: fd });
  return mustJson<ApiRankingResponse>(res);
}
export async function rankCVsMulti(params: {
  jdFiles: File[];
  cvFile: File;
  extractPortfolios: boolean;
}) {
  const form = new FormData();
  params.jdFiles.forEach((f) => form.append("jd_files", f));  // name must match backend
  form.append("cv_file", params.cvFile);
  form.append("extract_portfolios", String(params.extractPortfolios));

  const res = await fetch(`${API_BASE}/rank-cvs-multi`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}