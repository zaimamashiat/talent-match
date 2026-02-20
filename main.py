"""
CV Screening Pipeline - FastAPI Version v2.0 (fixed CSV -> candidate fields)
Run: uvicorn main:app --reload --port 8000
"""

import os
import re
import time
import json
import tempfile
from typing import List, Optional, Dict, Any

import pdfplumber
import pandas as pd
import torch
import torch.nn as nn
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
from bs4 import BeautifulSoup
from sentence_transformers import SentenceTransformer, util
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from rapidfuzz import fuzz
from groq import Groq

# ──────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────
GROQ_API_KEY = os.getenv("GROQ_API_KEY")  # set this in your env
MAX_CHARS_JD = 4000
MAX_CHARS_CV = 2000
MAX_CHARS_WEB = 3000
GITHUB_API = "https://api.github.com"

CATEGORIES = [
    "Data Science", "Java Developer", "Testing", "DevOps Engineer",
    "Python Developer", "Web Developer", "HR", "Hadoop", "Blockchain",
    "ETL Developer", "Operations Manager", "Sales", "Mechanical Engineer",
    "Arts", "Database", "Electrical Engineering", "Health and Fitness",
    "PMO", "Business Analyst", "DotNet Developer", "Automation Testing",
    "Network Security Engineer", "SAP Developer", "Civil Engineer", "Advocate"
]

JD_TECH_FIELDS = [
    "Technology", "Skills", "Technical Skills", "tech_skills",
    "technologies", "Technical_Skills", "Required_Skills"
]

TECH_SKILLS_COLUMN_OPTIONS = [
    "Technical Skills (??????????? ??????)\ne.g. Figma, .NET etc.",
    "Technical Skills",
    "tech_skills",
    "skills"
]

PORTFOLIO_COLUMN_OPTIONS = [
    "Portfolio Link", "portfolio link", "Portfolio", "portfolio",
    "Portfolio URL", "Website", "GitHub", "Github", "LinkedIn", "link", "url"
]

# ──────────────────────────────────────────────
# App
# ──────────────────────────────────────────────
app = FastAPI(
    title="CV Screening API",
    description="AI-powered CV screening, ranking & portfolio extraction",
    version="2.0.0"
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ──────────────────────────────────────────────
# Model cache
# ──────────────────────────────────────────────
_models: Dict[str, Any] = {}

def get_models():
    global _models
    if _models:
        return _models

    if not GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY environment variable is not set")

    print("Loading BERT...")
    tokenizer = AutoTokenizer.from_pretrained("SwaKyxd/resume-analyser-bert")
    bert = AutoModelForSequenceClassification.from_pretrained("SwaKyxd/resume-analyser-bert")
    bert.eval()

    print("Loading SBERT...")
    sbert = SentenceTransformer("all-mpnet-base-v2")
    reducer = nn.Linear(768, 384)

    _models = {
        "tokenizer": tokenizer,
        "bert": bert,
        "sbert": sbert,
        "reducer": reducer,
        "groq": Groq(api_key=GROQ_API_KEY),
    }
    print("All models loaded ✓")
    return _models

# ──────────────────────────────────────────────
# Pydantic schemas (updated to include new candidate fields)
# ──────────────────────────────────────────────
class PortfolioResult(BaseModel):
    url: str
    type: str
    summary: str
    skills_detected: List[str]
    repos: Optional[List[Dict]]
    error: Optional[str]

class CVRankEntry(BaseModel):
    rank: int
    candidate_id: str
    candidate_name: Optional[str] = None
    candidate_email: Optional[str] = None
    candidate_phone: Optional[str] = None
    cv_text: Optional[str] = None
    raw_row: Optional[Dict[str, Any]] = None

    category: str
    category_confidence: float
    semantic_match_pct: float
    tech_match_pct: float
    matched_skills: List[str]
    missing_skills: List[str]
    portfolio_url: Optional[str]
    portfolio_type: Optional[str]
    portfolio_summary: Optional[str]
    portfolio_skills: Optional[List[str]]

class RankingResponse(BaseModel):
    jd_title: Optional[str]
    jd_skills: List[str]
    total_candidates: int
    portfolios_scraped: int
    rankings: List[CVRankEntry]

class JDExtractResponse(BaseModel):
    filename: str
    extracted: Dict[str, Any]

class HealthResponse(BaseModel):
    status: str
    models_loaded: bool

# ══════════════════════════════════════════════
# ── PORTFOLIO SCRAPING ─────────────────────────
# ══════════════════════════════════════════════

def normalize_url(raw: str) -> Optional[str]:
    if not raw or not isinstance(raw, str):
        return None
    url = raw.strip()
    if url.lower() in {"n/a", "none", "no", "-", ""}:
        return None
    if not url.startswith("http"):
        url = "https://" + url
    if "." not in url:
        return None
    return url

def detect_portfolio_type(url: str) -> str:
    u = url.lower()
    if "github.com" in u:
        return "github"
    if "linkedin.com" in u:
        return "linkedin"
    return "website"

def scrape_website_text(url: str, timeout: int = 12) -> str:
    headers = {"User-Agent": "Mozilla/5.0 (compatible; CVScreener/2.0)"}
    try:
        r = requests.get(url, timeout=timeout, headers=headers)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        for tag in soup(["script", "style", "noscript", "nav", "footer"]):
            tag.decompose()
        text = soup.get_text(separator="\n", strip=True)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text[:MAX_CHARS_WEB]
    except Exception as e:
        return f"ERROR: {e}"

def extract_github_username(url: str) -> Optional[str]:
    parts = re.split(r"[/?#]", url.replace("https://", "").replace("http://", ""))
    if len(parts) >= 2 and "github.com" in parts[0]:
        u = parts[1].strip()
        return u if u else None
    return None

def fetch_github_repos(username: str, max_repos: int = 8) -> List[Dict]:
    try:
        headers = {"Accept": "application/vnd.github+json", "User-Agent": "CVScreener/2.0"}
        r = requests.get(f"{GITHUB_API}/users/{username}/repos",
                         params={"sort": "updated", "per_page": max_repos},
                         timeout=10, headers=headers)
        if r.status_code != 200:
            return []
        return [
            {
                "name": repo.get("name", ""),
                "description": repo.get("description") or "",
                "language": repo.get("language") or "",
                "topics": repo.get("topics", []) if isinstance(repo.get("topics", []), list) else [],
                "stars": repo.get("stargazers_count", 0),
                "url": repo.get("html_url", ""),
            }
            for repo in r.json()
        ]
    except Exception as e:
        print(f"GitHub API error ({username}): {e}")
        return []

def fetch_github_readme(username: str, repo: str) -> str:
    try:
        r = requests.get(f"{GITHUB_API}/repos/{username}/{repo}/readme",
                         headers={"Accept": "application/vnd.github.raw", "User-Agent": "CVScreener/2.0"},
                         timeout=8)
        return r.text[:1500] if r.status_code == 200 else ""
    except Exception:
        return ""

def llm_summarize(text: str, context: str, groq_client) -> str:
    prompt = f"""Summarize this {context} portfolio in max 120 words.
Focus on: technical skills, notable projects, tools & frameworks, overall developer profile.
Write a single concise paragraph. No bullet points.

Content:
{text[:2500]}"""
    try:
        resp = groq_client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0, max_completion_tokens=200,
        )
        return resp.choices[0].message.content.strip()
    except Exception as e:
        return f"Summary unavailable: {e}"

def llm_extract_skills(text: str, groq_client) -> List[str]:
    prompt = f"""List all technical skills, languages, frameworks, and tools mentioned in this text.
Return ONLY a comma-separated list. Example: Python, React, Docker, PostgreSQL

Text:
{text[:2000]}"""
    try:
        resp = groq_client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0, max_completion_tokens=150,
        )
        raw = resp.choices[0].message.content.strip()
        return [s.strip() for s in raw.split(",") if s.strip()]
    except Exception:
        return []

def scrape_portfolio(url: str, groq_client) -> Dict:
    clean = normalize_url(url)
    base = {"url": clean or url, "type": "unknown", "summary": "",
            "skills_detected": [], "repos": None, "error": None}
    if not clean:
        base["error"] = "Invalid URL"
        return base

    ptype = detect_portfolio_type(clean)
    base["type"] = ptype

    try:
        if ptype == "github":
            username = extract_github_username(clean)
            if not username:
                base["error"] = "Cannot extract GitHub username"
                return base

            repos = fetch_github_repos(username)
            base["repos"] = repos

            readme_texts = []
            for repo in sorted(repos, key=lambda r: r["stars"], reverse=True)[:3]:
                txt = fetch_github_readme(username, repo["name"])
                if txt:
                    readme_texts.append(f"[{repo['name']}]\n{txt}")
                time.sleep(0.3)

            repo_lines = "\n".join(
                f"{r['name']} ({r['language']}): {r['description']}"
                for r in repos if r.get("description")
            )
            combined = f"GitHub: {username}\n\nRepos:\n{repo_lines}\n\nREADMEs:\n" + "\n\n".join(readme_texts)
            base["summary"] = llm_summarize(combined, "GitHub", groq_client)
            base["skills_detected"] = llm_extract_skills(combined, groq_client)

        elif ptype == "linkedin":
            text = scrape_website_text(clean)
            if text.startswith("ERROR"):
                base["error"] = "LinkedIn blocked scraping (expected)"
                base["summary"] = "LinkedIn profile — scraping blocked by LinkedIn"
            else:
                base["summary"] = llm_summarize(text, "LinkedIn", groq_client)
                base["skills_detected"] = llm_extract_skills(text, groq_client)

        else:
            text = scrape_website_text(clean)
            if text.startswith("ERROR"):
                base["error"] = text
                base["summary"] = "Could not fetch website"
            else:
                base["summary"] = llm_summarize(text, "portfolio website", groq_client)
                base["skills_detected"] = llm_extract_skills(text, groq_client)

    except Exception as e:
        base["error"] = str(e)
        base["summary"] = f"Extraction failed: {e}"

    return base

# ══════════════════════════════════════════════
# ── CORE PIPELINE UTILS ────────────────────────
# ══════════════════════════════════════════════

def extract_pdf_text(path: str) -> str:
    text = ""
    try:
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    text += t + "\n"
    except Exception as e:
        print(f"pdfplumber: {e}")

    if not text.strip():
        try:
            import PyPDF2
            with open(path, "rb") as f:
                for page in PyPDF2.PdfReader(f).pages:
                    t = page.extract_text()
                    if t:
                        text += t + "\n"
        except Exception as e:
            print(f"PyPDF2: {e}")

    return re.sub(r"\s+", " ", text).strip()

def truncate(text: str, n: int) -> str:
    if len(text) <= n:
        return text
    cut = text[:n]
    for sep in ("\n", "."):
        pos = cut.rfind(sep)
        if pos > n * 0.8:
            return cut[:pos + 1]
    return cut

def call_groq(prompt: str, groq_client, retries=3, delay=3) -> str:
    for attempt in range(retries):
        try:
            resp = groq_client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[{"role": "user", "content": prompt}],
                temperature=0, max_completion_tokens=1024,
            )
            return resp.choices[0].message.content
        except Exception as e:
            wait = delay * (attempt + 1) * 2 if "rate_limit" in str(e).lower() else delay
            if attempt < retries - 1:
                time.sleep(wait)
    return "{}"

def normalize_skill(s: str) -> str:
    return re.sub(r"\s+", " ", s.lower().strip())

def parse_skills_str(raw) -> List[str]:
    if not raw:
        return []
    return [normalize_skill(s) for s in re.split(r"[,;|]", str(raw)) if s.strip()]

def fuzzy_skill_match(cv_skills, jd_skills, threshold=80):
    if not jd_skills:
        return 0.0, [], []
    matched, missing = [], []
    for jd_s in jd_skills:
        best = max(
            (max(fuzz.ratio(jd_s, c), fuzz.partial_ratio(jd_s, c),
                 fuzz.token_sort_ratio(jd_s, c), fuzz.token_set_ratio(jd_s, c))
             for c in cv_skills),
            default=0,
        )
        (matched if best >= threshold else missing).append(jd_s)
    pct = round(len(matched) / len(jd_skills) * 100, 2)
    return pct, matched, missing

def predict_category(text: str, models):
    tok, bert = models["tokenizer"], models["bert"]
    inp = tok(text[:512], truncation=True, padding=True, max_length=512, return_tensors="pt")
    with torch.no_grad():
        probs = torch.softmax(bert(**inp).logits, dim=1)
        idx = torch.argmax(probs, dim=1).item()
    return (CATEGORIES[idx] if idx < len(CATEGORIES) else "Unknown"), round(probs[0][idx].item(), 4)

def extract_jd_json(text: str, groq_client) -> dict:
    prompt = f"""Extract from this Job Description, return ONLY valid JSON with fields:
Job_Title, Company, Location, Experience, Education,
Skills (comma-separated string), Technology (comma-separated string),
Responsibilities, Qualifications, Salary, Additional_Info
Empty string "" for missing. No markdown.

JD:
{truncate(text, MAX_CHARS_JD)}"""
    raw = call_groq(prompt, groq_client)
    raw = re.sub(r"```json\n?|```\n?", "", raw.strip()).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"error": "JSON parse failed", "raw": raw[:500]}

# ══════════════════════════════════════════════
# ── ROUTES ────────────────────────────────────
# ══════════════════════════════════════════════

@app.get("/")
def root():
    return {"message": "CV Screening API is running", "docs": "/docs", "health": "/health"}

@app.get("/health", response_model=HealthResponse)
def health():
    return {"status": "ok", "models_loaded": bool(_models)}

@app.post("/load-models")
def load_models_route():
    get_models()
    return {"status": "Models loaded successfully"}

@app.post("/extract-jd", response_model=JDExtractResponse)
async def extract_jd(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files accepted")
    models = get_models()
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(await file.read())
        p = tmp.name
    try:
        text = extract_pdf_text(p)
    finally:
        os.unlink(p)
    if not text or len(text) < 50:
        raise HTTPException(422, "Could not extract text from PDF")
    return {"filename": file.filename, "extracted": extract_jd_json(text, models["groq"])}

@app.post("/extract-portfolio", response_model=PortfolioResult)
async def extract_portfolio_endpoint(url: str = Form(...)):
    models = get_models()
    cleaned = normalize_url(url)
    if not cleaned:
        raise HTTPException(400, "Invalid or empty URL")
    return scrape_portfolio(cleaned, models["groq"])

@app.post("/rank-cvs", response_model=RankingResponse)
async def rank_cvs(
    jd_file: UploadFile = File(...),
    cv_file: UploadFile = File(...),
    extract_portfolios: bool = Form(False),
):
    models = get_models()

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as jd_tmp:
        jd_tmp.write(await jd_file.read())
        jd_path = jd_tmp.name
    with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as cv_tmp:
        cv_tmp.write(await cv_file.read())
        cv_path = cv_tmp.name

    try:
        # 1. Extract JD
        jd_text = extract_pdf_text(jd_path)
        if not jd_text or len(jd_text) < 50:
            raise HTTPException(422, "Could not extract text from JD PDF")
        jd_data = extract_jd_json(jd_text, models["groq"])
        jd_skills = parse_skills_str(
            next((jd_data[f] for f in JD_TECH_FIELDS if f in jd_data and jd_data[f]), "")
        )

        # 2. Load CSV
        df = pd.read_csv(cv_path).fillna("")

        # identify columns
        skills_col = next(
            (c for opt in TECH_SKILLS_COLUMN_OPTIONS for c in [opt] if c in df.columns),
            next((c for c in df.columns if "technical" in c.lower() and "skill" in c.lower()), None)
        )
        portfolio_col = next(
            (opt for opt in PORTFOLIO_COLUMN_OPTIONS if opt in df.columns),
            next((c for c in df.columns if any(k in c.lower() for k in
                  ["portfolio", "github", "website", "linkedin", "link", "url"])), None)
        )
        id_col = next((c for c in ["Email Address", "Email", "Candidate_ID", "ID"] if c in df.columns), None)

        # --- improved CSV parsing: extract resume text, name, email, phone, raw row
        cv_ids = []
        cv_texts = []
        cv_skills_list = []
        cv_port_urls = []
        cv_meta_rows = []

        NAME_COL_CANDIDATES = ["Name", "Full Name", "Candidate Name", "First Name", "Last Name"]
        EMAIL_COL_CANDIDATES = ["Email Address", "Email", "E-mail", "candidate_email"]
        PHONE_COL_CANDIDATES = ["Phone", "Phone Number", "Contact", "Contact Number", "Mobile"]
        RESUME_COL_CANDIDATES = ["Resume", "CV", "CV Text", "Resume Text", "Cover Letter", "Summary", "Profile"]

        for idx, row in df.iterrows():
            # id
            raw_id = None
            if id_col and str(row.get(id_col)).strip():
                raw_id = str(row[id_col])
            else:
                for c in EMAIL_COL_CANDIDATES:
                    if c in df.columns and str(row.get(c)).strip():
                        raw_id = str(row[c])
                        break
            if not raw_id:
                raw_id = f"row_{idx}"
            cv_ids.append(raw_id)

            # resume text detection
            resume_text = ""
            for c in RESUME_COL_CANDIDATES:
                if c in df.columns and str(row.get(c)).strip():
                    resume_text = str(row.get(c)).strip()
                    break
            for c in ["Summary", "Profile", "About", "Bio"]:
                if not resume_text and c in df.columns and str(row.get(c)).strip():
                    resume_text = str(row.get(c)).strip()
                    break
            if not resume_text:
                resume_text = " | ".join(str(v) for v in row.values if str(v).strip())

            cv_texts.append(resume_text[:MAX_CHARS_CV])
            cv_skills_list.append(parse_skills_str(str(row[skills_col]) if skills_col else ""))
            cv_port_urls.append(normalize_url(str(row[portfolio_col])) if portfolio_col else None)

            raw_row = {}
            for k, v in row.items():
                try:
                    raw_row[str(k)] = v if (v is not None and (not pd.isna(v))) else ""
                except Exception:
                    raw_row[str(k)] = str(v)
            cv_meta_rows.append(raw_row)

        if not cv_texts:
            raise HTTPException(422, "No CV records found in CSV")

        # 4. Optional portfolio scraping
        port_cache: Dict[str, Dict] = {}
        if extract_portfolios and portfolio_col:
            unique = list({u for u in cv_port_urls if u})
            print(f"Scraping {len(unique)} unique portfolio URLs…")
            for u in unique:
                print(f"  → {u}")
                port_cache[u] = scrape_portfolio(u, models["groq"])
                time.sleep(2)

        # 5. embeddings
        def embed(text):
            return models["reducer"](
                torch.tensor(models["sbert"].encode(text[:512], convert_to_tensor=True)).unsqueeze(0)
            ).detach()

        jd_emb = embed(jd_text)
        cv_embs = torch.stack([embed(t).squeeze(0) for t in cv_texts])
        semantic_scores = [round(util.cos_sim(jd_emb, e.unsqueeze(0)).item() * 100, 2) for e in cv_embs]

        # 6. categories
        cat_results = [predict_category(t[:512], models) for t in cv_texts]

        # 7. assemble rows (now with name/email/phone/cv_text/raw_row included)
        rows = []
        for i, cid in enumerate(cv_ids):
            port_url = cv_port_urls[i]
            port_data = port_cache.get(port_url, {}) if port_url else {}

            if port_data.get("skills_detected"):
                augmented = list(set(cv_skills_list[i] + [normalize_skill(s) for s in port_data["skills_detected"]]))
            else:
                augmented = cv_skills_list[i]

            pct, matched, missing = fuzzy_skill_match(augmented, jd_skills)

            # extract name/email/phone from meta row
            meta = cv_meta_rows[i]
            candidate_name = ""
            for c in NAME_COL_CANDIDATES:
                if c in meta and str(meta[c]).strip():
                    candidate_name = str(meta[c]).strip()
                    break
            candidate_email = ""
            for c in EMAIL_COL_CANDIDATES:
                if c in meta and str(meta[c]).strip():
                    candidate_email = str(meta[c]).strip()
                    break
            candidate_phone = ""
            for c in PHONE_COL_CANDIDATES:
                if c in meta and str(meta[c]).strip():
                    candidate_phone = str(meta[c]).strip()
                    break

            rows.append({
                "rank": 0,
                "candidate_id": cid,
                "candidate_name": candidate_name,
                "candidate_email": candidate_email,
                "candidate_phone": candidate_phone,
                "cv_text": cv_texts[i],
                "raw_row": meta,
                "category": cat_results[i][0],
                "category_confidence": cat_results[i][1],
                "semantic_match_pct": semantic_scores[i],
                "tech_match_pct": pct,
                "matched_skills": matched,
                "missing_skills": missing,
                "portfolio_url": port_url,
                "portfolio_type": port_data.get("type"),
                "portfolio_summary": port_data.get("summary") or None,
                "portfolio_skills": port_data.get("skills_detected") or None,
            })

        rows.sort(key=lambda x: x["tech_match_pct"], reverse=True)
        for rank, row in enumerate(rows, 1):
            row["rank"] = rank

        return {
            "jd_title": jd_data.get("Job_Title", ""),
            "jd_skills": jd_skills,
            "total_candidates": len(rows),
            "portfolios_scraped": len(port_cache),
            "rankings": rows,
        }

    finally:
        os.unlink(jd_path)
        os.unlink(cv_path)

@app.post("/skill-match")
def skill_match_endpoint(
    cv_skills: str = Form(...),
    jd_skills: str = Form(...),
    threshold: int = Form(80),
):
    cv_list = parse_skills_str(cv_skills)
    jd_list = parse_skills_str(jd_skills)
    pct, matched, missing = fuzzy_skill_match(cv_list, jd_list, threshold)
    return {"match_pct": pct, "matched": matched, "missing": missing,
            "cv_count": len(cv_list), "jd_count": len(jd_list)}

@app.get("/categories")
def get_categories():
    return {"categories": CATEGORIES}
