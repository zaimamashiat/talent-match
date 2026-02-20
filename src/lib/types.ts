export type ApiJDExtractResponse = {
  filename: string;
  extracted: Record<string, any>;
};

// src/lib/types.ts
export type ApiCVRankEntry = {
  rank: number;
  candidate_id: string;
  candidate_name?: string | null;
  candidate_email?: string | null;
  candidate_phone?: string | null;
  cv_text?: string | null;
  raw_row?: Record<string, any> | null;

  category: string;
  category_confidence: number;
  semantic_match_pct: number;
  tech_match_pct: number;
  matched_skills: string[];
  missing_skills: string[];
  portfolio_url?: string | null;
  portfolio_type?: string | null;
  portfolio_summary?: string | null;
  portfolio_skills?: string[] | null;
};


export type ApiRankingResponse = {
  jd_title?: string;
  jd_skills: string[];
  total_candidates: number;
  portfolios_scraped: number;
  rankings: ApiCVRankEntry[];
};

/** Your dashboard uses this JD shape (from mockJDs). */
export type UIJD = {
  id: string;
  Job_Title: string;
  Company: string;
  Location: string;
  Technology: string; // comma string used by split(",")
};

/**
 * RankingTable might expect your old mock candidate format.
 * If your RankingTable already supports ApiCVRankEntry directly, you can skip mapping.
 * Otherwise map to a UI candidate shape you use in table.
 */
export type UICandidate = ApiCVRankEntry & {
  // add aliases if your table expects different keys
  id?: string;
  name?: string;
  email?: string;
};
