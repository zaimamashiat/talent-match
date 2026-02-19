import { useState } from "react";
import heroBg from "@/assets/hero-bg.jpg";
import { Sidebar } from "@/components/Sidebar";
import { StatsCards } from "@/components/StatsCards";
import { JDCard } from "@/components/JDCard";
import { RankingTable } from "@/components/RankingTable";
import { AnalyticsView } from "@/components/AnalyticsView";
import { UploadView } from "@/components/UploadView";
import { mockJDs, mockCandidates } from "@/data/mockData";
import { Bell, Search } from "lucide-react";

type View = "dashboard" | "jds" | "candidates" | "analytics" | "upload" | "settings";

export default function Index() {
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [selectedJD, setSelectedJD] = useState(mockJDs[0]);

  const candidates = mockCandidates[selectedJD.id] || [];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar activeView={activeView} onNavigate={(v) => setActiveView(v as View)} />

      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-6 py-3 flex items-center gap-4">
          <div className="flex-1 relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search candidates, JDs..."
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button className="relative p-2 rounded-lg hover:bg-muted transition-colors">
            <Bell className="w-4 h-4 text-muted-foreground" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-teal" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-semibold">
              HR
            </div>
            <div className="hidden sm:block">
              <p className="text-xs font-semibold text-foreground">HR Manager</p>
              <p className="text-[10px] text-muted-foreground">Admin</p>
            </div>
          </div>
        </header>

        <div className="p-6 space-y-6">
          {/* Dashboard View */}
          {activeView === "dashboard" && (
            <>
              {/* Hero Banner */}
              <div
                className="relative rounded-2xl overflow-hidden h-44 flex items-end p-6"
                style={{ backgroundImage: `url(${heroBg})`, backgroundSize: "cover", backgroundPosition: "center 30%" }}
              >
                <div className="absolute inset-0" style={{ background: "linear-gradient(105deg, hsl(224,64%,14%) 45%, hsl(224,64%,14%,0.6) 70%, hsl(224,64%,14%,0.1) 100%)" }} />
                <div className="relative z-10">
                  <h1 className="text-2xl font-bold text-white tracking-tight">CV Screening Pipeline</h1>
                  <p className="text-sm text-white/70 mt-1">AI-powered talent ranking — BERT · SBERT · Fuzzy Matching · LLaMA</p>
                  <div className="flex items-center gap-4 mt-3">
                    {["115 Candidates", "4 Job Descriptions", "68.4% Avg Match"].map(tag => (
                      <span key={tag} className="px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-xs text-white/80 font-medium">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>

              <StatsCards />

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* JD List */}
                <div className="xl:col-span-1 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground">Job Descriptions</h2>
                    <button
                      onClick={() => setActiveView("upload")}
                      className="text-xs text-teal font-medium hover:underline"
                    >
                      + Upload JD
                    </button>
                  </div>
                  {mockJDs.map(jd => (
                    <JDCard
                      key={jd.id}
                      jd={jd}
                      isSelected={selectedJD.id === jd.id}
                      onSelect={() => setSelectedJD(jd)}
                      candidateCount={mockCandidates[jd.id]?.length ?? 0}
                    />
                  ))}
                </div>

                {/* Rankings */}
                <div className="xl:col-span-2 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-semibold text-foreground">
                        Rankings — {selectedJD.Job_Title}
                      </h2>
                      <p className="text-xs text-muted-foreground">{selectedJD.Company} · {selectedJD.Location}</p>
                    </div>
                  </div>

                  {/* JD Tech Skills */}
                  <div className="rounded-xl border bg-card shadow-card p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Required Tech Skills</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedJD.Technology.split(",").map(s => s.trim()).filter(Boolean).map(skill => (
                        <span key={skill} className="px-2 py-0.5 rounded-full bg-primary/8 border border-primary/20 text-xs font-medium text-primary">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>

                  <RankingTable candidates={candidates} jdTitle={selectedJD.Job_Title} />
                </div>
              </div>
            </>
          )}

          {/* JDs View */}
          {activeView === "jds" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-foreground">Job Descriptions</h2>
                  <p className="text-sm text-muted-foreground">{mockJDs.length} JDs processed</p>
                </div>
                <button
                  onClick={() => setActiveView("upload")}
                  className="px-4 py-2 text-xs font-semibold rounded-lg teal-gradient text-white shadow-teal hover:opacity-90 transition-opacity"
                >
                  + Upload New JD
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {mockJDs.map(jd => (
                  <JDCard
                    key={jd.id}
                    jd={jd}
                    isSelected={selectedJD.id === jd.id}
                    onSelect={() => { setSelectedJD(jd); setActiveView("candidates"); }}
                    candidateCount={mockCandidates[jd.id]?.length ?? 0}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Candidates View */}
          {activeView === "candidates" && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div>
                  <h2 className="text-xl font-bold text-foreground">Candidate Rankings</h2>
                  <p className="text-sm text-muted-foreground">Select a JD to view ranked candidates</p>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                {mockJDs.map(jd => (
                  <button
                    key={jd.id}
                    onClick={() => setSelectedJD(jd)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      selectedJD.id === jd.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {jd.Job_Title}
                    <span className="ml-1.5 opacity-60">({mockCandidates[jd.id]?.length ?? 0})</span>
                  </button>
                ))}
              </div>

              <RankingTable candidates={mockCandidates[selectedJD.id] || []} jdTitle={selectedJD.Job_Title} />
            </div>
          )}

          {/* Analytics View */}
          {activeView === "analytics" && <AnalyticsView />}

          {/* Upload View */}
          {activeView === "upload" && <UploadView />}

          {/* Settings View */}
          {activeView === "settings" && (
            <div className="space-y-4 max-w-xl">
              <h2 className="text-xl font-bold text-foreground">Settings</h2>
              <div className="rounded-xl border bg-card shadow-card p-5 space-y-4">
                <div>
                  <label className="text-sm font-semibold text-foreground block mb-1">Groq API Key</label>
                  <input type="password" defaultValue="gsk_••••••••••••••••" className="w-full px-3 py-2 text-sm rounded-lg border bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-sm font-semibold text-foreground block mb-1">Fuzzy Match Threshold</label>
                  <input type="number" defaultValue={80} min={0} max={100} className="w-full px-3 py-2 text-sm rounded-lg border bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring" />
                  <p className="text-xs text-muted-foreground mt-1">Minimum RapidFuzz score for a skill to count as matched (0–100)</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-foreground block mb-1">SBERT Model</label>
                  <select className="w-full px-3 py-2 text-sm rounded-lg border bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring">
                    <option>all-mpnet-base-v2</option>
                    <option>all-MiniLM-L6-v2</option>
                    <option>paraphrase-multilingual-mpnet-base-v2</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-semibold text-foreground block mb-1">Tech Match Weight</label>
                  <input type="number" defaultValue={60} min={0} max={100} className="w-full px-3 py-2 text-sm rounded-lg border bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring" />
                  <p className="text-xs text-muted-foreground mt-1">% weight of Tech Match in overall score (remainder = Semantic Match)</p>
                </div>
                <button className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                  Save Settings
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
