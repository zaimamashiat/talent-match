"""
CV Screening Pipeline - FastAPI Version v2.1
Run: uvicorn main:app --reload --port 8000 --host 0.0.0.0
"""

import os
import re
import time
import json
import tempfile
from typing import List, Optional, Dict, Any

# ──────────────────────────────────────────────
# PATHS (no config.py needed)
# ──────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

OCR_OUTPUT_FOLDER           = os.path.join(BASE_DIR, "ocr_output")
EXCEL_OUTPUT_PATH           = os.path.join(BASE_DIR, "resume_summary.xlsx")
LDA_MODEL_PATH              = os.path.join(BASE_DIR, "models", "lda_model")
EMBED_DATA_PATH             = os.path.join(BASE_DIR, "models", "id2word.pkl")
EMBED_TFIDF_PATH            = os.path.join(BASE_DIR, "models", "tfidf_model.pkl")
PROCESSED_BIGRAM_DATA_PATH  = os.path.join(BASE_DIR, "models", "bigram_mod.pkl")
PROCESSED_TRIGRAM_DATA_PATH = os.path.join(BASE_DIR, "models", "trigram_mod.pkl")
K_MEANS_MODEL_PATH          = os.path.join(BASE_DIR, "models", "kmeans_model.pkl")
DESIGNATION_MODEL_PATH      = os.path.join(BASE_DIR, "models", "designation_model")
EXPERIENCE_MODEL_PATH       = os.path.join(BASE_DIR, "models", "experience_model")

NER_MODEL_PATH = os.getenv(
    "NER_MODEL_PATH",
    r"C:\PROJECTS\models\ner"
)

# Create folders if they don't exist
os.makedirs(OCR_OUTPUT_FOLDER, exist_ok=True)
os.makedirs(os.path.join(BASE_DIR, "models"), exist_ok=True)

# ──────────────────────────────────────────────
# IMPORTS
# ──────────────────────────────────────────────
import pdfplumber
import pandas as pd
import torch
import torch.nn as nn
import torch.optim as optim
from torch.distributions import Categorical
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
from bs4 import BeautifulSoup
from sentence_transformers import SentenceTransformer, util
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from rapidfuzz import fuzz
from groq import Groq
import spacy
import numpy as np
import pickle
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import normalize
from gensim import models as gensim_models
from gensim.utils import simple_preprocess
from gensim.matutils import sparse2full
from nltk.tokenize import word_tokenize
from nltk.corpus import stopwords
from nltk.probability import FreqDist
from dateutil import parser as date_parser
from datetime import datetime
from dateutil.relativedelta import relativedelta
from collections import defaultdict
import docx2txt

# ──────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
MAX_CHARS_JD  = 4000
MAX_CHARS_CV  = 2000
MAX_CHARS_WEB = 3000
GITHUB_API    = "https://api.github.com"

SEMANTIC_WEIGHT = 0.7
TECH_WEIGHT     = 0.3

CATEGORIES = [
    "Data Science",
    "Python Developer", "Web Developer", "Database", "DotNet Developer",
    "Automation Testing", "Machine Learning Engineer", "DevOps Engineer",
    "Mobile Developer", "Cloud Engineer",
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

ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8080",
    "http://localhost:4200",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8080",
    "http://127.0.0.1:4200",
]

# ──────────────────────────────────────────────
# App
# ──────────────────────────────────────────────
app = FastAPI(
    title="CV Screening API",
    description="AI-powered CV screening, ranking & portfolio extraction",
    version="2.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)

# ──────────────────────────────────────────────
# SBERT: all-mpnet-base-v2 (768 → 384 via reducer)
# ──────────────────────────────────────────────
SBERT_MODEL_PATH = os.getenv(
    "SBERT_MODEL_PATH",
    r"C:\PROJECTS\models\sentence_trasnformers\trained_mpnet_resume"
)
# AFTER
sbert_model = SentenceTransformer(SBERT_MODEL_PATH)

# Detect output dimension so the reducer always projects to 384-dim,
_sbert_out_dim = sbert_model.get_sentence_embedding_dimension()
_sbert_reducer = nn.Linear(_sbert_out_dim, 384) if _sbert_out_dim != 384 else nn.Identity()
_sbert_reducer.eval()

def _sbert_embed(text: str) -> torch.Tensor:
    """Encode with the locally trained sentence-transformer, then project to 384-dim."""
    raw = sbert_model.encode(text[:512], convert_to_tensor=True)   # (_sbert_out_dim,)
    with torch.no_grad():
        reduced = _sbert_reducer(raw.unsqueeze(0))                  # (1, 384)
    return reduced.squeeze(0)                                       # (384,)

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
    bert      = AutoModelForSequenceClassification.from_pretrained("SwaKyxd/resume-analyser-bert")
    bert.eval()

    print(f"Loading SBERT from: {SBERT_MODEL_PATH} (dim={_sbert_out_dim})...")

    ner = None
    if os.path.exists(NER_MODEL_PATH):
        print(f"Loading NER model from: {NER_MODEL_PATH}")
        try:
            ner = spacy.load(NER_MODEL_PATH)
            print("NER model loaded ✓")
        except Exception as e:
            print(f"⚠️  NER model failed to load: {e} — continuing without NER")
    else:
        print(f"⚠️  NER model path not found: {NER_MODEL_PATH} — continuing without NER")

    _models = {
        "tokenizer": tokenizer,
        "bert":      bert,
        "sbert":     sbert_model,
        "reducer":   _sbert_reducer,
        "groq":      Groq(api_key=GROQ_API_KEY),
        "ner":       ner,
    }
    print("All models loaded ✓")
    return _models


# ──────────────────────────────────────────────
# Policy Model (RL)
# ──────────────────────────────────────────────
class ResumePolicy(nn.Module):
    def __init__(self, input_dim=384, hidden_dim=128, num_actions=3):
        super().__init__()
        self.fc1     = nn.Linear(input_dim, hidden_dim)
        self.relu    = nn.ReLU()
        self.fc2     = nn.Linear(hidden_dim, num_actions)
        self.softmax = nn.Softmax(dim=-1)

    def forward(self, x):
        x = self.relu(self.fc1(x))
        return self.softmax(self.fc2(x))

policy_model     = ResumePolicy(input_dim=384, hidden_dim=128, num_actions=3)
policy_optimizer = optim.Adam(policy_model.parameters(), lr=1e-4)
ACTIONS          = ["use_designation_model", "use_experience_model", "combine_both"]

def build_context_vector(designation_text, skills_text, experience_text):
    combined = f"{designation_text}. {skills_text}. {experience_text}"
    emb = _sbert_embed(combined)                        # (384,)
    return emb.unsqueeze(0).requires_grad_(True)        # (1, 384)

def reinforce_update(optimizer, log_prob, reward):
    loss = -log_prob * reward
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()

def policy_guided_resume_analysis(designation_text, skills_text, experience_text,
                                   resume_text, training_mode=True):
    ctx    = build_context_vector(designation_text, skills_text, experience_text)
    probs  = policy_model(ctx)
    dist   = Categorical(probs)
    action = dist.sample()
    log_prob       = dist.log_prob(action)
    chosen_action  = ACTIONS[action.item()]

    if chosen_action == "use_designation_model":
        label, conf = run_designation_model(resume_text)
        comp_cost   = 1.0
    elif chosen_action == "use_experience_model":
        label, conf = run_experience_model(resume_text)
        comp_cost   = 0.8
    else:
        d_label, d_conf = run_designation_model(resume_text)
        _,       e_conf = run_experience_model(resume_text)
        label     = d_label
        conf      = (d_conf + e_conf) / 2
        comp_cost = 1.5

    reward = conf - 0.1 * comp_cost
    if training_mode:
        reinforce_update(policy_optimizer, log_prob, reward)

    return {
        "action":       chosen_action,
        "pred_label":   label,
        "reward":       float(reward),
        "accuracy":     float(conf),
        "policy_probs": probs.detach().cpu().numpy().tolist()
    }


# ──────────────────────────────────────────────
# Designation / Experience models
# ──────────────────────────────────────────────
_designation_tokenizer = None
_designation_model     = None
_experience_tokenizer  = None
_experience_model      = None

def _load_local_models():
    global _designation_tokenizer, _designation_model
    global _experience_tokenizer,  _experience_model

    if _designation_model is None and os.path.exists(DESIGNATION_MODEL_PATH):
        print("Loading designation model...")
        _designation_tokenizer = AutoTokenizer.from_pretrained(DESIGNATION_MODEL_PATH)
        _designation_model     = AutoModelForSequenceClassification.from_pretrained(DESIGNATION_MODEL_PATH)
        _designation_model.eval()

    if _experience_model is None and os.path.exists(EXPERIENCE_MODEL_PATH):
        print("Loading experience model...")
        _experience_tokenizer = AutoTokenizer.from_pretrained(EXPERIENCE_MODEL_PATH)
        _experience_model     = AutoModelForSequenceClassification.from_pretrained(EXPERIENCE_MODEL_PATH)
        _experience_model.eval()

def run_designation_model(resume_text: str):
    _load_local_models()
    label_map = {0: "Business Analyst", 1: "Data Scientist", 2: "SQA", 3: "Web Developer"}
    if _designation_model is None:
        return "Unknown", 0.0
    inputs = _designation_tokenizer(
        resume_text, truncation=True, padding=True, max_length=512, return_tensors="pt"
    )
    with torch.no_grad():
        logits = _designation_model(**inputs).logits
        pred   = torch.argmax(logits, dim=-1).item()
        score  = torch.softmax(logits, dim=-1)[0, pred].item()
    return label_map.get(pred, "Unknown"), score

def run_experience_model(resume_text: str):
    _load_local_models()
    label_map = {0: "Junior", 1: "Mid", 2: "Senior"}
    if _experience_model is None:
        return "Unknown", 0.0
    inputs = _experience_tokenizer(
        resume_text, truncation=True, padding=True, max_length=512, return_tensors="pt"
    )
    with torch.no_grad():
        logits = _experience_model(**inputs).logits
        pred   = torch.argmax(logits, dim=-1).item()
        score  = torch.softmax(logits, dim=-1)[0, pred].item()
    return label_map.get(pred, "Unknown"), score

def infer_experience_level_with_model(resume_text: str) -> str:
    label, _ = run_experience_model(resume_text)
    return label


# ──────────────────────────────────────────────
# NER skill extraction
# ──────────────────────────────────────────────
NER_SKILL_LABELS = {"Skills", "Technology", "Designation", "Certifications"}

def ner_extract_skills(text: str, ner_model) -> List[str]:
    if ner_model is None or not text.strip():
        return []
    try:
        doc    = ner_model(text[:1000])
        skills = []
        for ent in doc.ents:
            if ent.label_ in NER_SKILL_LABELS:
                for part in re.split(r"[,;|/]", ent.text):
                    s = normalize_skill(part)
                    if s and len(s) > 1:
                        skills.append(s)
        return skills
    except Exception as e:
        print(f"NER extraction error: {e}")
        return []


# ──────────────────────────────────────────────
# Pydantic schemas
# ──────────────────────────────────────────────
class PortfolioResult(BaseModel):
    url:             str
    type:            str
    summary:         str
    skills_detected: List[str]
    repos:           Optional[List[Dict]]
    error:           Optional[str]

class CVRankEntry(BaseModel):
    rank:                int
    candidate_id:        str
    candidate_name:      Optional[str] = None
    candidate_email:     Optional[str] = None
    candidate_phone:     Optional[str] = None
    cv_text:             Optional[str] = None
    raw_row:             Optional[Dict[str, Any]] = None
    category:            str
    category_confidence: float
    semantic_match_pct:  float
    tech_match_pct:      float
    priority_boost:      float
    total_score:         float
    matched_skills:      List[str]
    missing_skills:      List[str]
    portfolio_url:       Optional[str]
    portfolio_type:      Optional[str]
    portfolio_summary:   Optional[str]
    portfolio_skills:    Optional[List[str]]

class RankedCandidate(BaseModel):
    rank:               int
    candidate:          str
    category:           str
    tech_match_pct:     float
    semantic_match_pct: float
    total_score:        float
    matched_skills:     List[str]

class RankingResponse(BaseModel):
    jd_title:           Optional[str]
    jd_skills:          List[str]
    total_candidates:   int
    portfolios_scraped: int
    semantic_weight:    float
    tech_weight:        float
    ranked_table:       List[RankedCandidate]
    rankings:           List[CVRankEntry]

class JDExtractResponse(BaseModel):
    filename:  str
    extracted: Dict[str, Any]

class HealthResponse(BaseModel):
    status:        str
    models_loaded: bool


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
            headers={"Accept": "application/vnd.github.raw", "User-Agent": "CVScreener/2.0"},
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
    base  = {
        "url":             clean or url,
        "type":            "unknown",
        "summary":         "",
        "skills_detected": [],
        "repos":           None,
        "error":           None,
    }
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
            repos        = fetch_github_repos(username)
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
            combined                = f"GitHub: {username}\n\nRepos:\n{repo_lines}\n\nREADMEs:\n" + "\n\n".join(readme_texts)
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

def read_word_resume(word_doc: str) -> Optional[str]:
    try:
        text = docx2txt.process(word_doc)
        text = ''.join(str(text)).replace("\n", "")
        return text if text.strip() else None
    except Exception as e:
        print(f"Error reading {word_doc}: {e}")
        return None

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


# ──────────────────────────────────────────────
# DATE / DURATION HELPERS
# ──────────────────────────────────────────────

def parse_duration(text: str) -> float:
    text = text.lower()
    text = (text.replace('yrs', 'years').replace('yr', 'year')
                .replace('mos', 'months').replace('mo', 'month'))
    matches = re.findall(r'(\d+(?:\.\d+)?)\s*(year|month|week|day)s?', text)
    months  = 0.0
    for value, unit in matches:
        val = float(value)
        if   'year'  in unit: months += val * 12
        elif 'month' in unit: months += val
        elif 'week'  in unit: months += val / 4.345
        elif 'day'   in unit: months += val / 30
    return round(months)

def parse_date_range(start_str: str, end_str: str) -> float:
    try:
        start = date_parser.parse(start_str.strip(), fuzzy=True)
        try:
            end = date_parser.parse(end_str.strip(), fuzzy=True)
        except Exception:
            end = datetime.today()
        diff = relativedelta(end, start)
        return diff.years * 12 + diff.months + diff.days / 30
    except Exception:
        return 0.0

def months_to_string(months: float) -> str:
    months = round(months, 2)
    if months < 1:
        return f"{round(months * 30)} days"
    years      = int(months // 12)
    rem_months = int(months % 12)
    result     = []
    if years      > 0: result.append(f"{years} year{'s' if years > 1 else ''}")
    if rem_months > 0: result.append(f"{rem_months} month{'s' if rem_months > 1 else ''}")
    return ' '.join(result) if result else "0 months"


# ──────────────────────────────────────────────
# PRIORITY BOOST HELPERS
# ──────────────────────────────────────────────

DESIGNATION_RANK = {
    'intern': 0.5, 'junior': 0.8, 'associate': 1.0, 'engineer': 1.1,
    'senior': 1.3, 'lead': 1.5, 'manager': 1.7,
    'director': 2.0, 'head': 2.2, 'chief': 2.5,
}
TOP_COMPANIES = {
    'openai': 2.5, 'google': 2.4, 'microsoft': 2.3, 'apple': 2.2,
    'facebook': 2.2, 'meta': 2.2, 'amazon': 2.1, 'nvidia': 2.0,
}
DEGREE_RANK  = {'phd': 2.5, 'masters': 2.0, 'mba': 1.8, 'bachelors': 1.5, 'diploma': 1.2}
COLLEGE_RANK = {'mit': 2.5, 'stanford': 2.4, 'iit': 2.3, 'harvard': 2.3, 'berkeley': 2.1}

PROJECT_KEYWORDS_BY_ROLE = {
    'web_developer':     {'web': 2.5, 'frontend': 2.3, 'backend': 2.2, 'react': 2.5, 'angular': 2.4},
    'data_scientist':    {'ai': 2.5, 'ml': 2.3, 'nlp': 2.2, 'deep learning': 2.2, 'pytorch': 2.0},
    'data_engineer':     {'etl': 2.5, 'pipeline': 2.3, 'spark': 2.2},
    'devops_engineer':   {'kubernetes': 2.4, 'docker': 2.3, 'ci/cd': 2.2},
    'software_engineer': {'api': 2.0, 'system': 2.2},
    'product_manager':   {'roadmap': 2.3, 'strategy': 2.5},
}
CERT_KEYWORDS_BY_ROLE = {
    'web_developer':     {'html': 1.5, 'css': 1.5, 'javascript': 1.8},
    'data_scientist':    {'ml': 2.0, 'ai': 2.1, 'dl': 2.0, 'gcp': 1.9},
    'data_engineer':     {'big data': 2.0, 'spark': 2.0},
    'devops_engineer':   {'aws': 2.2, 'azure': 2.0, 'docker': 2.0, 'terraform': 2.1},
    'software_engineer': {'java': 1.5, 'python': 1.5},
    'product_manager':   {'pmp': 2.0, 'scrum': 1.8},
}
REWARD_KEYWORDS_BY_ROLE = {
    'web_developer':     {'best frontend': 2.0, 'ux': 1.8},
    'data_scientist':    {'innovation': 2.2, 'research': 2.0},
    'data_engineer':     {'efficiency': 1.8, 'optimization': 2.0},
    'devops_engineer':   {'automation': 2.0, 'uptime': 1.9},
    'product_manager':   {'delivery': 2.0, 'vision': 2.2},
}

def _get_max_rank(text: str, rank_map: dict) -> float:
    return max((v for k, v in rank_map.items() if k in text.lower()), default=0.0)

def _infer_primary_role(designation_text: str) -> str:
    role_keywords = {
        'web_developer':     ['web developer', 'frontend', 'backend', 'full stack', 'react', 'angular'],
        'data_scientist':    ['data scientist', 'machine learning', 'ml', 'ai', 'nlp', 'deep learning'],
        'data_engineer':     ['data engineer', 'etl', 'big data', 'pipeline'],
        'devops_engineer':   ['devops', 'site reliability', 'sre', 'infrastructure', 'cloud'],
        'software_engineer': ['software engineer', 'developer'],
        'product_manager':   ['product manager', 'pm'],
    }
    counts = {
        role: sum(1 for kw in kws if kw in designation_text.lower())
        for role, kws in role_keywords.items()
    }
    return max(counts, key=counts.get)

def compute_priority_boost(meta: dict, matched_skills: List[str]) -> float:
    boost = 0.0

    def _field(*keys):
        for k in keys:
            v = str(meta.get(k, "")).strip()
            if v and v.lower() != "nan":
                return v.lower()
        return ""

    designation_text = _field("Designation", "designation", "Title", "Job Title")
    companies_text   = _field("Companies",   "companies",   "Company", "Employer")
    education_text   = _field("Education",   "education",   "Degree")
    college_text     = _field("CollegeName", "College",     "college_name", "University")
    experience_text  = _field("Experience",  "experience",  "Work Experience")
    projects_text    = _field("Projects",    "projects")
    certs_text       = _field("Certifications", "certifications", "Certificates")
    rewards_text     = _field("Rewards",     "rewards",     "Awards", "Achievements")

    primary_role = _infer_primary_role(designation_text)

    exp_months = parse_duration(experience_text)
    boost += min(exp_months / 12, 10.0)

    boost += _get_max_rank(designation_text, DESIGNATION_RANK)
    boost += _get_max_rank(companies_text,   TOP_COMPANIES)
    boost += _get_max_rank(education_text,   DEGREE_RANK)
    boost += _get_max_rank(college_text,     COLLEGE_RANK)
    boost += _get_max_rank(projects_text,    PROJECT_KEYWORDS_BY_ROLE.get(primary_role, {}))
    boost += _get_max_rank(certs_text,       CERT_KEYWORDS_BY_ROLE.get(primary_role, {}))
    boost += _get_max_rank(rewards_text,     REWARD_KEYWORDS_BY_ROLE.get(primary_role, {}))

    if matched_skills:
        boost += 3.0

    return round(boost, 4)

def parse_skills_str(raw) -> List[str]:
    if not raw:
        return []
    return [normalize_skill(s) for s in re.split(r"[,;|]", str(raw)) if s.strip()]

def fuzzy_skill_match(
    cv_skills: List[str],
    jd_skills: List[str],
    threshold: int = 80,
) -> tuple:
    if not jd_skills:
        return 0.0, [], []
    if not cv_skills:
        return 0.0, [], list(jd_skills)

    matched, missing = [], []
    for jd_s in jd_skills:
        best = max(
            (
                max(
                    fuzz.ratio(jd_s, c),
                    fuzz.token_sort_ratio(jd_s, c),
                    fuzz.token_set_ratio(jd_s, c),
                )
                for c in cv_skills
            ),
            default=0,
        )
        (matched if best >= threshold else missing).append(jd_s)

    pct = round(len(matched) / len(jd_skills) * 100, 2)
    return pct, matched, missing

def extract_skills_from_text(text: str) -> List[str]:
    tokens = re.split(r"[,;|\n]", text)
    skills = []
    for t in tokens:
        t = t.strip()
        if not t or len(t.split()) > 4 or t.isdigit():
            continue
        if re.search(r"\b(is|are|was|were|have|has|had|will|would|can|could|the|and|or|to|in|of|for|with)\b", t.lower()):
            continue
        skills.append(normalize_skill(t))
    seen = set()
    return [s for s in skills if not (s in seen or seen.add(s))]

def predict_category(text: str, models):
    tok, bert = models["tokenizer"], models["bert"]
    inp = tok(text[:512], truncation=True, padding=True, max_length=512, return_tensors="pt")
    with torch.no_grad():
        probs = torch.softmax(bert(**inp).logits, dim=1)
        idx   = torch.argmax(probs, dim=1).item()
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
# ROUTES
# ══════════════════════════════════════════════

@app.get("/")
def root():
    return {"message": "CV Screening API is running", "docs": "/docs", "health": "/health"}

@app.get("/health", response_model=HealthResponse)
def health():
    return {"status": "ok", "models_loaded": bool(_models)}

@app.options("/{full_path:path}")
async def options_handler(full_path: str):
    return {}

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
    extract_portfolios: bool  = Form(False),
    semantic_weight:    float = Form(SEMANTIC_WEIGHT),
    tech_weight:        float = Form(TECH_WEIGHT),
):
    models = get_models()

    total_w = semantic_weight + tech_weight
    if total_w <= 0:
        semantic_weight, tech_weight = SEMANTIC_WEIGHT, TECH_WEIGHT
        total_w = 1.0
    sem_w = round(semantic_weight / total_w, 4)
    tec_w = round(1.0 - sem_w, 4)

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as jd_tmp:
        jd_tmp.write(await jd_file.read())
        jd_path = jd_tmp.name
    with tempfile.NamedTemporaryFile(delete=False, suffix=".csv") as cv_tmp:
        cv_tmp.write(await cv_file.read())
        cv_path = cv_tmp.name

    try:
        # ── 1. Extract JD ──────────────────────────────────────────────────
        jd_text = extract_pdf_text(jd_path)
        if not jd_text or len(jd_text) < 50:
            raise HTTPException(422, "Could not extract text from JD PDF")
        jd_data   = extract_jd_json(jd_text, models["groq"])
        jd_skills = parse_skills_str(
            next((jd_data[f] for f in JD_TECH_FIELDS if f in jd_data and jd_data[f]), "")
        )

        # ── 2. Load CSV ────────────────────────────────────────────────────
        df = pd.read_csv(cv_path).fillna("")

        skills_col = next(
            (c for opt in TECH_SKILLS_COLUMN_OPTIONS for c in [opt] if c in df.columns),
            next((c for c in df.columns if "technical" in c.lower() and "skill" in c.lower()), None)
        )
        portfolio_col = next(
            (opt for opt in PORTFOLIO_COLUMN_OPTIONS if opt in df.columns),
            next((c for c in df.columns if any(k in c.lower() for k in
                  ["portfolio", "github", "website", "linkedin", "link", "url"])), None)
        )
        id_col = next(
            (c for c in ["Email Address", "Email", "Candidate_ID", "ID"] if c in df.columns), None
        )

        NAME_COL_CANDIDATES   = ["Name", "Full Name", "Candidate Name", "First Name", "Last Name"]
        EMAIL_COL_CANDIDATES  = ["Email Address", "Email", "E-mail", "candidate_email"]
        PHONE_COL_CANDIDATES  = ["Phone", "Phone Number", "Contact", "Contact Number", "Mobile"]
        RESUME_COL_CANDIDATES = ["Resume", "CV", "CV Text", "Resume Text", "Cover Letter", "Summary", "Profile"]

        cv_ids, cv_texts, cv_skills_list, cv_port_urls, cv_meta_rows = [], [], [], [], []

        for idx, row in df.iterrows():
            # Candidate ID
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

            # Resume text
            resume_text = ""
            for c in RESUME_COL_CANDIDATES + ["Summary", "Profile", "About", "Bio"]:
                if c in df.columns and str(row.get(c)).strip():
                    resume_text = str(row.get(c)).strip()
                    break
            if not resume_text:
                resume_text = " | ".join(str(v) for v in row.values if str(v).strip())
            cv_texts.append(resume_text[:MAX_CHARS_CV])

            # Skill extraction
            if skills_col and str(row.get(skills_col, "")).strip():
                explicit_skills = parse_skills_str(str(row[skills_col]))
            else:
                explicit_skills = extract_skills_from_text(resume_text)
            cv_skills_list.append(explicit_skills)

            cv_port_urls.append(
                normalize_url(str(row[portfolio_col])) if portfolio_col else None
            )

            raw_row: Dict[str, Any] = {}
            for k, v in row.items():
                try:
                    raw_row[str(k)] = v if (v is not None and (not pd.isna(v))) else ""
                except Exception:
                    raw_row[str(k)] = str(v)
            cv_meta_rows.append(raw_row)

        if not cv_texts:
            raise HTTPException(422, "No CV records found in CSV")

        # ── 3. Optional portfolio scraping ────────────────────────────────
        port_cache: Dict[str, Dict] = {}
        if extract_portfolios and portfolio_col:
            unique = list({u for u in cv_port_urls if u})
            print(f"Scraping {len(unique)} unique portfolio URLs…")
            for u in unique:
                print(f"  → {u}")
                port_cache[u] = scrape_portfolio(u, models["groq"])
                time.sleep(2)

        # ── 4. Semantic embeddings (all-mpnet-base-v2 → 384-dim) ──────────
        def embed(text):
            return _sbert_embed(text[:512])   # (384,)

        jd_emb          = embed(jd_text)
        cv_embs         = torch.stack([embed(t) for t in cv_texts])
        semantic_scores = [
            round(util.cos_sim(jd_emb.unsqueeze(0), e.unsqueeze(0)).item() * 100, 2)
            for e in cv_embs
        ]

        # ── 5. Category prediction ─────────────────────────────────────────
        cat_results = [predict_category(t[:512], models) for t in cv_texts]

        # ── 5b. NER skill extraction ───────────────────────────────────────
        ner_skills_list: List[List[str]] = []
        if models.get("ner"):
            print("Extracting skills via NER model...")
            for t in cv_texts:
                ner_skills_list.append(ner_extract_skills(t, models["ner"]))
        else:
            ner_skills_list = [[] for _ in cv_texts]

        # ── 6. Build candidate rows ────────────────────────────────────────
        rows = []
        for i, cid in enumerate(cv_ids):
            port_url  = cv_port_urls[i]
            port_data = port_cache.get(port_url, {}) if port_url else {}

            augmented = list(cv_skills_list[i])
            if port_data.get("skills_detected"):
                augmented = list(set(augmented + [
                    normalize_skill(s) for s in port_data["skills_detected"]
                ]))
            if ner_skills_list[i]:
                augmented = list(set(augmented + ner_skills_list[i]))

            tech_pct, matched, missing = fuzzy_skill_match(augmented, jd_skills)
            sem_pct        = semantic_scores[i]
            meta           = cv_meta_rows[i]
            priority_boost = compute_priority_boost(meta, matched)
            total_score    = round(sem_w * sem_pct + tec_w * tech_pct + priority_boost, 2)

            candidate_name = next(
                (str(meta[c]).strip() for c in NAME_COL_CANDIDATES
                 if c in meta and str(meta[c]).strip()), ""
            )
            candidate_email = next(
                (str(meta[c]).strip() for c in EMAIL_COL_CANDIDATES
                 if c in meta and str(meta[c]).strip()), ""
            )
            candidate_phone = next(
                (str(meta[c]).strip() for c in PHONE_COL_CANDIDATES
                 if c in meta and str(meta[c]).strip()), ""
            )

            # Policy-guided role & experience inference
            designation_text = str(meta.get("Designation", meta.get("designation", "")))
            skills_text      = str(meta.get("Skills", meta.get("skills", "")))
            experience_text  = str(meta.get("Experience", meta.get("experience", "")))

            policy_output = policy_guided_resume_analysis(
                designation_text, skills_text, experience_text,
                cv_texts[i], training_mode=False
            )

            rows.append({
                "rank":                0,
                "candidate_id":        cid,
                "candidate_name":      candidate_name,
                "candidate_email":     candidate_email,
                "candidate_phone":     candidate_phone,
                "cv_text":             cv_texts[i],
                "raw_row":             meta,
                "category":            policy_output["pred_label"] or cat_results[i][0],
                "category_confidence": cat_results[i][1],
                "semantic_match_pct":  sem_pct,
                "tech_match_pct":      tech_pct,
                "priority_boost":      priority_boost,
                "total_score":         total_score,
                "matched_skills":      matched,
                "missing_skills":      missing,
                "portfolio_url":       port_url,
                "portfolio_type":      port_data.get("type"),
                "portfolio_summary":   port_data.get("summary") or None,
                "portfolio_skills":    port_data.get("skills_detected") or None,
            })

        # ── 7. Sort & assign ranks ─────────────────────────────────────────
        rows.sort(key=lambda x: x["total_score"], reverse=True)
        for rank, row in enumerate(rows, 1):
            row["rank"] = rank

        # ── 8. Build slim ranked_table ─────────────────────────────────────
        ranked_table = []
        for row in rows:
            display_name = row["candidate_name"] or row["candidate_email"] or row["candidate_id"]
            ranked_table.append({
                "rank":               row["rank"],
                "candidate":          display_name,
                "category":           row["category"],
                "tech_match_pct":     row["tech_match_pct"],
                "semantic_match_pct": row["semantic_match_pct"],
                "total_score":        row["total_score"],
                "matched_skills":     row["matched_skills"],
            })

        return {
            "jd_title":           jd_data.get("Job_Title", ""),
            "jd_skills":          jd_skills,
            "total_candidates":   len(rows),
            "portfolios_scraped": len(port_cache),
            "semantic_weight":    sem_w,
            "tech_weight":        tec_w,
            "ranked_table":       ranked_table,
            "rankings":           rows,
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
    return {
        "match_pct": pct,
        "matched":   matched,
        "missing":   missing,
        "cv_count":  len(cv_list),
        "jd_count":  len(jd_list),
    }

@app.get("/categories")
def get_categories():
    return {"categories": CATEGORIES}