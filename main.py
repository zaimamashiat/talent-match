"""
CV Screening Pipeline - FastAPI Version v4.0
Handles bilingual Bengali/English Google Form CSV exports.
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
GROQ_API_KEY  = os.getenv("GROQ_API_KEY")
MAX_CHARS_JD  = 4000
MAX_CHARS_CV  = 3000
MAX_CHARS_WEB = 3000
GITHUB_API    = "https://api.github.com"

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

# ══════════════════════════════════════════════════════════════════════════════
# COLUMN KEYWORD MAPS
# Maps a semantic type → list of substrings (lowercased).
# A column matches if its lowercased header contains ANY substring in the list.
# Covers both English and Bengali text as found in Google Form exports.
# ══════════════════════════════════════════════════════════════════════════════
COL_KEYWORDS: Dict[str, List[str]] = {
    "timestamp":      ["timestamp"],
    "email":          ["email address", "email", "e-mail", "ইমেইল"],
    "name":           ["full name", "পূর্ণ নাম", "candidate name", "applicant name"],
    "phone":          ["phone number", "ফোন নম্বর", "mobile", "contact number"],
    "dob":            ["date of birth", "জন্ম তারিখ"],
    "gender":         ["gender", "লিঙ্গ"],
    "address":        ["present address", "বর্তমান ঠিকানা"],
    "division":       ["which division", "কোন বিভাগ"],
    "district":       ["which district", "কোন জেলা"],
    "interest":       ["area of interest", "আগ্রহের ক্ষেত্র"],
    "university":     ["university name", "বিশ্ববিদ্যালয়ের নাম"],
    "subject":        ["bachelors/honors subject", "ব্যাচেলর্স/অনার্স বিষয়"],
    "major":          ["bachelors/honors major", "অনার্স মেজর"],
    "grad_year":      ["year of bachelors", "স্নাতক সম্পন্নের বছর"],
    "cgpa":           ["cgpa", "সিজিপিএ"],
    "portfolio":      ["portfolio link", "পোর্টফোলিও লিংক", "portfolio url",
                       "portfolio", "github", "linkedin", "website link"],
    "designation":    ["designation", "পদবী"],
    "organization":   ["organization", "প্রতিষ্ঠান"],
    "start_date":     ["starting date", "শুরুর তারিখ"],
    "end_date":       ["ending date", "শেষের তারিখ"],
    "cert_name":      ["name of the certification", "সার্টিফিকেশন বা কোর্সের নাম"],
    "cert_duration":  ["course duration", "কোর্সের মেয়াদ"],
    "cert_start":     ["course starting date", "কোর্স শুরুর তারিখ"],
    "digital_skills": ["digital skills", "ডিজিটাল দক্ষতা"],
    "tech_skills":    ["technical skills", "প্রযুক্তিগত দক্ষতা"],
    "lang_skills":    ["language skills", "ভাষাগত দক্ষতা"],
    "soft_skills":    ["soft skills", "সফট স্কিলস"],
    "training_name":  ["training name", "প্রশিক্ষণের নাম"],
    "training_org":   ["training organization", "প্রশিক্ষণ প্রতিষ্ঠান"],
    "training_dur":   ["training duration", "প্রশিক্ষণের মেয়াদ"],
}

# These column types contain metadata that should NOT go into the resume embedding
META_TYPES = {
    "timestamp", "dob", "gender", "address", "division", "district", "email", "phone"
}

# ──────────────────────────────────────────────
# App
# ──────────────────────────────────────────────
app = FastAPI(
    title="CV Screening API",
    description="AI-powered CV screening for bilingual Bengali/English Google Form CSV exports",
    version="4.0.0"
)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

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
    sbert   = SentenceTransformer("all-mpnet-base-v2")
    reducer = nn.Linear(768, 384)
    _models = {
        "tokenizer": tokenizer, "bert": bert,
        "sbert": sbert, "reducer": reducer,
        "groq": Groq(api_key=GROQ_API_KEY),
    }
    print("All models loaded ✓")
    return _models

# ──────────────────────────────────────────────
# Pydantic schemas
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
    candidate_id:    str
    candidate_name:  Optional[str] = None
    candidate_email: Optional[str] = None
    candidate_phone: Optional[str] = None
    cv_text:         Optional[str] = None
    raw_row:         Optional[Dict[str, Any]] = None
    category:             str
    category_confidence:  float
    semantic_match_pct:   float
    tech_match_pct:       float
    matched_skills:       List[str]
    missing_skills:       List[str]
    portfolio_url:        Optional[str]
    portfolio_type:       Optional[str]
    portfolio_summary:    Optional[str]
    portfolio_skills:     Optional[List[str]]

class RankingResponse(BaseModel):
    jd_title:           Optional[str]
    jd_skills:          List[str]
    total_candidates:   int
    portfolios_scraped: int
    rankings:           List[CVRankEntry]

class JDExtractResponse(BaseModel):
    filename:  str
    extracted: Dict[str, Any]

class HealthResponse(BaseModel):
    status:        str
    models_loaded: bool

# ══════════════════════════════════════════════
# COLUMN DETECTION HELPERS
# ══════════════════════════════════════════════

def col_type(col_name: str) -> Optional[str]:
    """Return the semantic type for a column header, or None if unknown."""
    cl = col_name.lower()
    for ctype, keywords in COL_KEYWORDS.items():
        if any(kw in cl for kw in keywords):
            return ctype
    return None

def classify_all_columns(df: pd.DataFrame) -> Dict[str, List[str]]:
    """Map every column to its semantic type. Returns type -> [col, col2, ...] dict."""
    result: Dict[str, List[str]] = {}
    for col in df.columns:
        ct = col_type(col)
        if ct:
            result.setdefault(ct, []).append(col)
    return result

def first_col(classified: Dict[str, List[str]], ctype: str) -> Optional[str]:
    cols = classified.get(ctype, [])
    return cols[0] if cols else None

def all_cols(classified: Dict[str, List[str]], ctype: str) -> List[str]:
    return classified.get(ctype, [])

# ══════════════════════════════════════════════
# CELL HELPERS
# ══════════════════════════════════════════════

def safe_cell(row: pd.Series, col: Optional[str]) -> str:
    if not col or col not in row.index:
        return ""
    v = row[col]
    if v is None:
        return ""
    try:
        if pd.isna(v):
            return ""
    except Exception:
        pass
    s = str(v).strip()
    return "" if s.lower() in {"nan", "none", "null", ""} else s

def multi_cell(row: pd.Series, cols: List[str], sep: str = " | ") -> str:
    """Concatenate non-empty values from multiple same-type columns."""
    return sep.join(safe_cell(row, c) for c in cols if safe_cell(row, c))

# ══════════════════════════════════════════════
# RESUME TEXT BUILDER
# ══════════════════════════════════════════════

def build_resume_text(row: pd.Series, classified: Dict[str, List[str]]) -> str:
    """
    Build a structured, readable resume text from a CSV row.
    Metadata fields (email, phone, DOB, address, etc.) are excluded.
    Covers all sections from the Google Form: education, experience,
    certifications, skills, and training.
    """
    parts: List[str] = []

    def add(label: str, val: str):
        if val.strip():
            parts.append(f"{label}: {val.strip()}")

    # Area of interest
    add("Area of Interest", multi_cell(row, all_cols(classified, "interest")))

    # Education
    uni     = multi_cell(row, all_cols(classified, "university"), " / ")
    subject = safe_cell(row, first_col(classified, "subject"))
    major   = safe_cell(row, first_col(classified, "major"))
    yr      = safe_cell(row, first_col(classified, "grad_year"))
    cgpa    = safe_cell(row, first_col(classified, "cgpa"))
    edu     = [x for x in [uni, subject, major] if x]
    if yr:   edu.append(f"Graduated {yr}")
    if cgpa: edu.append(f"CGPA {cgpa}")
    add("Education", ", ".join(edu))

    # Work experience (all designation/org/date groups)
    desig_cols = all_cols(classified, "designation")
    org_cols   = all_cols(classified, "organization")
    sd_cols    = all_cols(classified, "start_date")
    ed_cols    = all_cols(classified, "end_date")
    for i in range(max(len(desig_cols), len(org_cols))):
        d = safe_cell(row, desig_cols[i]) if i < len(desig_cols) else ""
        o = safe_cell(row, org_cols[i])   if i < len(org_cols)   else ""
        s = safe_cell(row, sd_cols[i])    if i < len(sd_cols)    else ""
        e = safe_cell(row, ed_cols[i])    if i < len(ed_cols)    else ""
        if d or o:
            role = f"{d} @ {o}" if (d and o) else (d or o)
            if s or e:
                role += f" ({s} – {e})"
            parts.append(f"Work Experience: {role}")

    # Certifications / courses (all cert groups)
    cn_cols = all_cols(classified, "cert_name")
    cd_cols = all_cols(classified, "cert_duration")
    cs_cols = all_cols(classified, "cert_start")
    for i in range(len(cn_cols)):
        cn = safe_cell(row, cn_cols[i])
        cd = safe_cell(row, cd_cols[i]) if i < len(cd_cols) else ""
        cs = safe_cell(row, cs_cols[i]) if i < len(cs_cols) else ""
        if cn:
            c_str = cn
            if cd: c_str += f" ({cd}"
            if cs: c_str += f", started {cs}"
            if cd: c_str += ")"
            parts.append(f"Certification: {c_str}")

    # Skills sections
    add("Digital Skills",   multi_cell(row, all_cols(classified, "digital_skills")))
    add("Technical Skills", multi_cell(row, all_cols(classified, "tech_skills")))
    add("Language Skills",  multi_cell(row, all_cols(classified, "lang_skills")))
    add("Soft Skills",      multi_cell(row, all_cols(classified, "soft_skills")))

    # Trainings (all training groups)
    tn_cols = all_cols(classified, "training_name")
    to_cols = all_cols(classified, "training_org")
    td_cols = all_cols(classified, "training_dur")
    for i in range(len(tn_cols)):
        tn = safe_cell(row, tn_cols[i])
        to = safe_cell(row, to_cols[i]) if i < len(to_cols) else ""
        td = safe_cell(row, td_cols[i]) if i < len(td_cols) else ""
        if tn:
            t_str = tn
            if to: t_str += f" @ {to}"
            if td: t_str += f" ({td})"
            parts.append(f"Training: {t_str}")

    result = "\n".join(parts)
    return result[:MAX_CHARS_CV]

# ══════════════════════════════════════════════
# PORTFOLIO SCRAPING
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
    if "github.com"   in u: return "github"
    if "linkedin.com" in u: return "linkedin"
    return "website"

def scrape_website_text(url: str, timeout: int = 12) -> str:
    headers = {"User-Agent": "Mozilla/5.0 (compatible; CVScreener/4.0)"}
    try:
        r = requests.get(url, timeout=timeout, headers=headers)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        for tag in soup(["script", "style", "noscript", "nav", "footer"]):
            tag.decompose()
        text = soup.get_text(separator="\n", strip=True)
        return re.sub(r"\n{3,}", "\n\n", text)[:MAX_CHARS_WEB]
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
        headers = {"Accept": "application/vnd.github+json", "User-Agent": "CVScreener/4.0"}
        r = requests.get(
            f"{GITHUB_API}/users/{username}/repos",
            params={"sort": "updated", "per_page": max_repos},
            timeout=10, headers=headers
        )
        if r.status_code != 200:
            return []
        return [
            {
                "name":        repo.get("name", ""),
                "description": repo.get("description") or "",
                "language":    repo.get("language") or "",
                "topics":      repo.get("topics", []),
                "stars":       repo.get("stargazers_count", 0),
                "url":         repo.get("html_url", ""),
            }
            for repo in r.json()
        ]
    except Exception as e:
        print(f"GitHub API error ({username}): {e}")
        return []

def fetch_github_readme(username: str, repo: str) -> str:
    try:
        r = requests.get(
            f"{GITHUB_API}/repos/{username}/{repo}/readme",
            headers={"Accept": "application/vnd.github.raw", "User-Agent": "CVScreener/4.0"},
            timeout=8
        )
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
    base  = {"url": clean or url, "type": "unknown", "summary": "",
             "skills_detected": [], "repos": None, "error": None}
    if not clean:
        base["error"] = "Invalid URL"
        return base

    ptype        = detect_portfolio_type(clean)
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
            combined = (f"GitHub: {username}\n\nRepos:\n{repo_lines}\n\nREADMEs:\n"
                        + "\n\n".join(readme_texts))
            base["summary"]         = llm_summarize(combined, "GitHub", groq_client)
            base["skills_detected"] = llm_extract_skills(combined, groq_client)

        elif ptype == "linkedin":
            text = scrape_website_text(clean)
            if text.startswith("ERROR"):
                base["error"]   = "LinkedIn blocked scraping (expected)"
                base["summary"] = "LinkedIn profile — scraping blocked by LinkedIn"
            else:
                base["summary"]         = llm_summarize(text, "LinkedIn", groq_client)
                base["skills_detected"] = llm_extract_skills(text, groq_client)
        else:
            text = scrape_website_text(clean)
            if text.startswith("ERROR"):
                base["error"]   = text
                base["summary"] = "Could not fetch website"
            else:
                base["summary"]         = llm_summarize(text, "portfolio website", groq_client)
                base["skills_detected"] = llm_extract_skills(text, groq_client)
    except Exception as e:
        base["error"]   = str(e)
        base["summary"] = f"Extraction failed: {e}"

    return base

# ══════════════════════════════════════════════
# CORE PIPELINE UTILS
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
            print(f"Groq attempt {attempt+1} failed: {e}, retrying in {wait}s")
            if attempt < retries - 1:
                time.sleep(wait)
    return "{}"

def normalize_skill(s: str) -> str:
    return re.sub(r"\s+", " ", s.lower().strip())

def parse_skills_str(raw) -> List[str]:
    if not raw:
        return []
    return [normalize_skill(s) for s in re.split(r"[,;|/]", str(raw)) if s.strip()]

def fuzzy_skill_match(cv_skills: List[str], jd_skills: List[str], threshold: int = 80):
    if not jd_skills:
        return 0.0, [], []
    matched, missing = [], []
    for jd_s in jd_skills:
        best = max(
            (max(
                fuzz.ratio(jd_s, c),
                fuzz.partial_ratio(jd_s, c),
                fuzz.token_sort_ratio(jd_s, c),
                fuzz.token_set_ratio(jd_s, c)
            ) for c in cv_skills),
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
        idx   = torch.argmax(probs, dim=1).item()
    label = CATEGORIES[idx] if idx < len(CATEGORIES) else "Unknown"
    return label, round(probs[0][idx].item(), 4)

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
# ROUTES
# ══════════════════════════════════════════════

@app.get("/")
def root():
    return {"message": "CV Screening API v4.0 running", "docs": "/docs", "health": "/health"}

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
    models  = get_models()
    cleaned = normalize_url(url)
    if not cleaned:
        raise HTTPException(400, "Invalid or empty URL")
    return scrape_portfolio(cleaned, models["groq"])

@app.post("/rank-cvs", response_model=RankingResponse)
async def rank_cvs(
    jd_file:            UploadFile = File(...),
    cv_file:            UploadFile = File(...),
    extract_portfolios: bool       = Form(False),
):
    """
    Rank candidates from a Google Form CSV export against a Job Description PDF.

    Accepts bilingual (Bengali + English) column headers.
    Column detection is keyword-based — headers do not need to match exactly.

    Expected CSV sections (all optional except name/email):
      - Candidate info: Full Name, Email Address, Phone Number
      - Education: University, Subject, Major, Grad Year, CGPA
      - Portfolio: Portfolio Link / GitHub / LinkedIn
      - Work: Designation, Organization, Starting/Ending Date (up to 3 roles)
      - Certifications: Name, Duration, Start Date (up to 3)
      - Skills: Digital Skills, Technical Skills, Language Skills, Soft Skills
      - Training: Training Name, Organization, Duration (up to 3)
    """
    models = get_models()

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as jd_tmp:
        jd_tmp.write(await jd_file.read())
        jd_path = jd_tmp.name
    with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as cv_tmp:
        cv_tmp.write(await cv_file.read())
        cv_path = cv_tmp.name

    try:
        # ── 1. Extract & parse JD ─────────────────────────────────────────────
        jd_text = extract_pdf_text(jd_path)
        if not jd_text or len(jd_text) < 50:
            raise HTTPException(422, "Could not extract text from JD PDF")

        jd_data   = extract_jd_json(jd_text, models["groq"])
        jd_skills = parse_skills_str(
            next((jd_data[f] for f in JD_TECH_FIELDS if f in jd_data and jd_data[f]), "")
        )
        print(f"JD title: {jd_data.get('Job_Title', 'Unknown')}")
        print(f"JD skills ({len(jd_skills)}): {jd_skills}")

        # ── 2. Load CSV ───────────────────────────────────────────────────────
        try:
            df = pd.read_csv(cv_path, dtype=str).fillna("")
        except Exception as e:
            raise HTTPException(422, f"Could not parse CSV: {e}")

        if df.empty:
            raise HTTPException(422, "CSV file is empty")

        print(f"CSV: {len(df)} rows | {len(df.columns)} columns")

        classified = classify_all_columns(df)
        print("Detected column types:", {k: len(v) for k, v in classified.items()})

        # Resolve key columns
        name_col      = first_col(classified, "name")
        email_col     = first_col(classified, "email")
        phone_col     = first_col(classified, "phone")
        portfolio_col = first_col(classified, "portfolio")

        # ── 3. Build candidate records ────────────────────────────────────────
        records = []
        for idx, row in df.iterrows():
            name  = safe_cell(row, name_col)
            email = safe_cell(row, email_col)
            phone = safe_cell(row, phone_col)

            # Unique ID: email > name > row number
            cid = email or name or f"row_{idx + 1}"

            # Portfolio URL
            port_url = normalize_url(safe_cell(row, portfolio_col))

            # Skills: combine Technical + Digital skills columns
            tech_raw    = multi_cell(row, all_cols(classified, "tech_skills"))
            digital_raw = multi_cell(row, all_cols(classified, "digital_skills"))
            skills = parse_skills_str(", ".join(filter(None, [tech_raw, digital_raw])))

            # Structured resume text (metadata-free)
            resume_text = build_resume_text(row, classified)

            # Fallback: join all non-meta, non-empty cells
            if not resume_text:
                meta_cols: set = set()
                for mt in META_TYPES:
                    meta_cols.update(all_cols(classified, mt))
                resume_text = " | ".join(
                    f"{c}: {safe_cell(row, c)}"
                    for c in df.columns
                    if c not in meta_cols and safe_cell(row, c)
                )[:MAX_CHARS_CV]

            raw_row = {str(k): safe_cell(row, k) for k in df.columns}

            records.append({
                "candidate_id":    cid,
                "candidate_name":  name,
                "candidate_email": email,
                "candidate_phone": phone,
                "skills":          skills,
                "portfolio_url":   port_url,
                "resume_text":     resume_text,
                "raw_row":         raw_row,
            })

        if not records:
            raise HTTPException(422, "No candidate records found in CSV")

        print(f"Parsed {len(records)} candidates")

        # ── 4. Optional portfolio scraping ────────────────────────────────────
        port_cache: Dict[str, Dict] = {}
        if extract_portfolios:
            unique_urls = list({r["portfolio_url"] for r in records if r["portfolio_url"]})
            print(f"Scraping {len(unique_urls)} portfolio URLs...")
            for u in unique_urls:
                print(f"  → {u}")
                port_cache[u] = scrape_portfolio(u, models["groq"])
                time.sleep(2)

        # ── 5. Embeddings ─────────────────────────────────────────────────────
        def embed(text: str):
            # SBERT runs under inference_mode; clone() exits inference mode
            # so the nn.Linear reducer can operate under no_grad safely.
            enc = models["sbert"].encode(text[:512], convert_to_tensor=True)
            enc = enc.clone()          # exits inference_mode context
            with torch.no_grad():
                return models["reducer"](enc.unsqueeze(0)).detach()

        print("Embedding JD...")
        jd_emb = embed(jd_text)

        print("Embedding candidates...")
        cv_embs = torch.stack([embed(r["resume_text"]).squeeze(0) for r in records])
        semantic_scores = [
            round(util.cos_sim(jd_emb, e.unsqueeze(0)).item() * 100, 2)
            for e in cv_embs
        ]

        # ── 6. Category prediction ────────────────────────────────────────────
        print("Predicting categories...")
        cat_results = [predict_category(r["resume_text"][:512], models) for r in records]

        # ── 7. Assemble & rank ────────────────────────────────────────────────
        rows = []
        for i, rec in enumerate(records):
            port_url  = rec["portfolio_url"]
            port_data = port_cache.get(port_url, {}) if port_url else {}

            aug_skills = list(set(
                rec["skills"] + [normalize_skill(s) for s in port_data.get("skills_detected", [])]
            ))

            # Keyword fallback if still no skills
            if not aug_skills:
                COMMON_TECH = [
                    "python", "java", "javascript", "typescript", "react", "node.js", "sql",
                    "docker", "kubernetes", "aws", "azure", "gcp", "tensorflow", "pytorch",
                    "machine learning", "deep learning", "nlp", "git", "linux", "django",
                    "flask", "fastapi", "postgresql", "mongodb", "redis", "figma", ".net",
                    "c#", "c++", "php", "laravel", "vue", "angular", "spark", "hadoop",
                    "ms word", "ms excel", "powerpoint", "photoshop", "illustrator"
                ]
                tl = rec["resume_text"].lower()
                aug_skills = [t for t in COMMON_TECH if t in tl]

            pct, matched, missing = fuzzy_skill_match(aug_skills, jd_skills)

            rows.append({
                "rank":                0,
                "candidate_id":        rec["candidate_id"],
                "candidate_name":      rec["candidate_name"],
                "candidate_email":     rec["candidate_email"],
                "candidate_phone":     rec["candidate_phone"],
                "cv_text":             rec["resume_text"],
                "raw_row":             rec["raw_row"],
                "category":            cat_results[i][0],
                "category_confidence": cat_results[i][1],
                "semantic_match_pct":  semantic_scores[i],
                "tech_match_pct":      pct,
                "matched_skills":      matched,
                "missing_skills":      missing,
                "portfolio_url":       port_url,
                "portfolio_type":      port_data.get("type"),
                "portfolio_summary":   port_data.get("summary") or None,
                "portfolio_skills":    port_data.get("skills_detected") or None,
            })

        # Sort by tech match %, then semantic % as tiebreaker
        rows.sort(key=lambda x: (x["tech_match_pct"], x["semantic_match_pct"]), reverse=True)
        for rank, row in enumerate(rows, 1):
            row["rank"] = rank

        top = rows[0]
        print(f"✓ Ranked. #1: {top['candidate_name'] or top['candidate_id']} "
              f"| tech={top['tech_match_pct']}% | sem={top['semantic_match_pct']}%")

        return {
            "jd_title":           jd_data.get("Job_Title", ""),
            "jd_skills":          jd_skills,
            "total_candidates":   len(rows),
            "portfolios_scraped": len(port_cache),
            "rankings":           rows,
        }

    finally:
        os.unlink(jd_path)
        os.unlink(cv_path)

@app.post("/skill-match")
def skill_match_endpoint(
    cv_skills: str = Form(...),
    jd_skills: str = Form(...),
    threshold:  int = Form(80),
):
    cv_list = parse_skills_str(cv_skills)
    jd_list = parse_skills_str(jd_skills)
    pct, matched, missing = fuzzy_skill_match(cv_list, jd_list, threshold)
    return {"match_pct": pct, "matched": matched, "missing": missing,
            "cv_count": len(cv_list), "jd_count": len(jd_list)}

@app.get("/categories")
def get_categories():
    return {"categories": CATEGORIES}

@app.post("/debug-csv")
async def debug_csv(cv_file: UploadFile = File(...)):
    """
    Debug endpoint: upload a CSV to inspect how every column is classified
    and preview the first 2 candidates' extracted resume text.
    Call this first when debugging a new CSV format.
    """
    with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as tmp:
        tmp.write(await cv_file.read())
        path = tmp.name
    try:
        df = pd.read_csv(path, dtype=str).fillna("")
        classified = classify_all_columns(df)
        previews = []
        for _, row in df.head(2).iterrows():
            previews.append({
                "name":            safe_cell(row, first_col(classified, "name")),
                "email":           safe_cell(row, first_col(classified, "email")),
                "phone":           safe_cell(row, first_col(classified, "phone")),
                "tech_skills_raw": multi_cell(row, all_cols(classified, "tech_skills")),
                "digital_skills_raw": multi_cell(row, all_cols(classified, "digital_skills")),
                "portfolio_url":   safe_cell(row, first_col(classified, "portfolio")),
                "resume_preview":  build_resume_text(row, classified)[:500],
            })
        return {
            "total_rows":           len(df),
            "total_columns":        len(df.columns),
            "raw_columns":          list(df.columns),
            "classified_columns":   {k: v for k, v in classified.items() if v},
            "unclassified_columns": [c for c in df.columns if col_type(c) is None],
            "sample_candidates":    previews,
        }
    finally:
        os.unlink(path)