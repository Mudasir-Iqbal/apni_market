"use client";

import React, { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { 
  Sparkles, CheckCircle2, XCircle, Flame, Settings, 
  LogOut, RefreshCw, Send, ShieldCheck, Globe 
} from "lucide-react";

// ============================================================================
// 1. CONFIGURATION (Jab connectivity karenge to .env.local mein dalenge)
// ============================================================================
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://YOUR-PROJECT.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "YOUR_SUPABASE_ANON_KEY";
const N8N_GENERATE_WEBHOOK = process.env.NEXT_PUBLIC_N8N_GENERATE_URL || "https://your-n8n.com/webhook/generate-meme";
const N8N_APPROVAL_WEBHOOK = process.env.NEXT_PUBLIC_N8N_APPROVAL_URL || "https://your-n8n.com/webhook/post-approval";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function MemeSaaSDashboard() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"queue" | "trends" | "dna">("queue");

  // Auth Form State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);

  // Tenant Data State
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [trends, setTrends] = useState<any[]>([]);
  const [customTopic, setCustomTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ============================================================================
  // 2. AUTH & DATA FETCHING (RLS Automatically Isolates Each Business!)
  // ============================================================================
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadTenantDashboard();
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) loadTenantDashboard();
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadTenantDashboard() {
    // 1. Load My Business Profile (Filtered by RLS)
    const { data: prof } = await supabase.from("business_profiles").select("*").single();
    if (prof) setProfile(prof);

    // 2. Load My Posts (Filtered by RLS)
    const { data: myPosts } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false });
    if (myPosts) setPosts(myPosts);

    // 3. Load Active Regional Trends
    const { data: regTrends } = await supabase
      .from("regional_trends")
      .select("*")
      .order("virality_score", { ascending: false })
      .limit(12);
    if (regTrends) setTrends(regTrends);
  }

  // ============================================================================
  // 3. ACTIONS: LOGIN, GENERATE MEME, APPROVE/REJECT, SAVE DNA
  // ============================================================================
  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { business_name: businessName || "My Brand", region_code: "PK-KHI" } }
      });
      if (error) showToast(error.message, "err");
      else showToast("Account created! Check email or login.", "ok");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) showToast(error.message, "err");
    }
    setLoading(false);
  }

  // Calls Workflow 02 (AI Meme Generator)
  async function handleGenerateMeme(topicOverride?: string) {
    if (!session) return;
    setGenerating(true);
    try {
      const res = await fetch(N8N_GENERATE_WEBHOOK, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ customTopic: topicOverride ?? customTopic })
      });
      const data = await res.json();
      if (data.success) {
        showToast("🔥 Naya Regional Meme tayyar ho gaya!", "ok");
        setCustomTopic("");
        setActiveTab("queue");
        await loadTenantDashboard();
      } else {
        showToast(data.error || "Generation failed", "err");
      }
    } catch (err: any) {
      showToast("n8n Webhook Error: Check connection", "err");
    }
    setGenerating(false);
  }

  // Calls Workflow 03 (Approval & Facebook Publisher)
  async function handleDecision(postId: string, action: "approve" | "reject") {
    if (!session) return;
    setProcessingId(postId);
    try {
      const res = await fetch(N8N_APPROVAL_WEBHOOK, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ postId, action })
      });
      const data = await res.json();
      if (data.success) {
        showToast(
          action === "approve" ? "✅ Facebook Page par publish ho gaya!" : "❌ Draft reject kar diya gaya.",
          "ok"
        );
        await loadTenantDashboard();
      } else {
        showToast(data.error || "Action failed", "err");
      }
    } catch (err) {
      showToast("n8n Approval Webhook unreachable", "err");
    }
    setProcessingId(null);
  }

  // Save edited caption directly via Supabase RLS
  async function handleUpdateCaption(postId: string, newCaption: string) {
    const { error } = await supabase
      .from("posts")
      .update({ caption: newCaption })
      .eq("id", postId);
    if (!error) showToast("Caption updated!", "ok");
  }

  // Save Brand DNA Settings
  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase
      .from("business_profiles")
      .update({
        business_name: profile.business_name,
        niche: profile.niche,
        region_code: profile.region_code,
        language_style: profile.language_style,
        brand_tone: profile.brand_tone,
        humor_level: Number(profile.humor_level),
        product_focus: profile.product_focus,
        onboarding_completed: true
      })
      .eq("id", profile.id);

    if (error) showToast(error.message, "err");
    else showToast("Brand DNA save ho gaya!", "ok");
  }

  // ============================================================================
  // 4. UI RENDER: LOGIN SCREEN (If not logged in)
  // ============================================================================
  if (!session) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center gap-2 text-indigo-400 font-bold text-xl mb-2">
            <Sparkles className="w-6 h-6" /> MemePulse AI SaaS
          </div>
          <p className="text-slate-400 text-sm mb-6">
            Multi-Tenant Regional Meme & Social Media Automation
          </p>

          <form onSubmit={handleAuth} className="space-y-4">
            {isSignUp && (
              <div>
                <label className="text-xs text-slate-400">Business Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Burger Lab / Khaadi / Agency"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm"
                />
              </div>
            )}
            <div>
              <label className="text-xs text-slate-400">Business Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 font-semibold py-2.5 rounded-lg transition"
            >
              {isSignUp ? "Create Business Account" : "Sign In to Dashboard"}
            </button>
          </form>

          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="w-full text-center text-xs text-slate-400 hover:text-white mt-4"
          >
            {isSignUp ? "Already have an account? Login" : "New business? Create tenant account"}
          </button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // 5. UI RENDER: MAIN TENANT DASHBOARD
  // ============================================================================
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 px-5 py-3 rounded-xl shadow-xl font-medium text-sm ${
          toast.type === "ok" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className="w-6 h-6 text-indigo-400" />
            <div>
              <h1 className="font-bold text-lg leading-none">
                {profile?.business_name || "My Business"}
              </h1>
              <span className="text-xs text-emerald-400 flex items-center gap-1 mt-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Isolated Tenant • Region: {profile?.region_code}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("queue")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === "queue" ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-800"
              }`}
            >
              Approval Queue ({posts.filter(p => p.status === "pending_approval").length})
            </button>
            <button
              onClick={() => setActiveTab("trends")}
              className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition ${
                activeTab === "trends" ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-800"
              }`}
            >
              <Flame className="w-4 h-4 text-orange-400" /> Regional Trends
            </button>
            <button
              onClick={() => setActiveTab("dna")}
              className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition ${
                activeTab === "dna" ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-800"
              }`}
            >
              <Settings className="w-4 h-4" /> Brand DNA
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              className="p-2 text-slate-400 hover:text-rose-400 ml-2"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Generator Bar */}
        <div className="bg-gradient-to-r from-indigo-950/60 to-slate-900 border border-indigo-500/30 rounded-2xl p-6 mb-8 flex flex-col md:flex-row items-center gap-4 justify-between">
          <div className="flex-1 w-full">
            <h2 className="font-semibold text-base mb-1">Generate Regional Viral Meme</h2>
            <input
              type="text"
              placeholder="Optional: Koi khaas topic ya offer? (e.g., Karachi barish + 20% off on Zinger) — Khali chhor dein to AI khud aaj ka top trend utha lega!"
              value={customTopic}
              onChange={(e) => setCustomTopic(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white"
            />
          </div>
          <button
            onClick={() => handleGenerateMeme()}
            disabled={generating}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-6 py-3 rounded-xl font-semibold text-sm flex items-center gap-2 shrink-0 shadow-lg shadow-indigo-600/20"
          >
            {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? "AI Meme Bana Raha Hai..." : "Generate New Meme"}
          </button>
        </div>

        {/* TAB 1: APPROVAL QUEUE */}
        {activeTab === "queue" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {posts.map((post) => (
              <div key={post.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
                <div className="relative bg-black aspect-square max-h-80 flex items-center justify-center">
                  {post.media_url ? (
                    <img src={post.media_url} alt="Meme" className="object-contain h-full w-full" />
                  ) : (
                    <span className="text-slate-500 text-sm">Text-Only Post</span>
                  )}
                  <span className={`absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-bold uppercase ${
                    post.status === "pending_approval" ? "bg-amber-500/20 text-amber-300 border border-amber-500/40" :
                    post.status === "published" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" :
                    "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                  }`}>
                    {post.status.replace("_", " ")}
                  </span>
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <label className="text-xs text-slate-400">Post Caption (Editable before approval):</label>
                    <textarea
                      rows={3}
                      defaultValue={post.caption}
                      onBlur={(e) => handleUpdateCaption(post.id, e.target.value)}
                      disabled={post.status !== "pending_approval"}
                      className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-slate-200"
                    />
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {(post.hashtags || []).map((tag: string, i: number) => (
                        <span key={i} className="text-xs text-indigo-400 bg-indigo-950/50 px-2 py-0.5 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {post.status === "pending_approval" && (
                    <div className="flex items-center gap-3 pt-2 border-t border-slate-800">
                      <button
                        onClick={() => handleDecision(post.id, "approve")}
                        disabled={processingId === post.id}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {processingId === post.id ? "Publishing..." : "Approve & Publish to FB"}
                      </button>
                      <button
                        onClick={() => handleDecision(post.id, "reject")}
                        disabled={processingId === post.id}
                        className="px-4 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-1"
                      >
                        <XCircle className="w-4 h-4" /> Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 2: REGIONAL TRENDS RADAR */}
        {activeTab === "trends" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {trends.map((t) => (
              <div key={t.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                    <span className="flex items-center gap-1 text-orange-400 font-semibold">
                      <Globe className="w-3.5 h-3.5" /> {t.region_code} • {t.emotion_tag}
                    </span>
                    <span>Score: {t.virality_score}/100</span>
                  </div>
                  <h3 className="font-bold text-base mb-2">{t.trend_title}</h3>
                  <p className="text-xs text-slate-400 mb-3">{t.meme_format_rule}</p>
                </div>
                <button
                  onClick={() => handleGenerateMeme(`Use this exact trend: ${t.trend_title} (${t.meme_format_rule})`)}
                  className="w-full mt-3 bg-slate-800 hover:bg-indigo-600 text-xs font-semibold py-2.5 rounded-lg transition flex items-center justify-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" /> Make Meme on This Trend
                </button>
              </div>
            ))}
          </div>
        )}

        {/* TAB 3: BRAND DNA SETTINGS */}
        {activeTab === "dna" && profile && (
          <form onSubmit={handleSaveProfile} className="max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold mb-2">Configure Your Brand DNA & Regional Humor</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400">Business Name</label>
                <input
                  value={profile.business_name || ""}
                  onChange={(e) => setProfile({ ...profile, business_name: e.target.value })}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Industry / Niche</label>
                <input
                  placeholder="e.g., Fast Food Burger Restaurant, Clothing Brand"
                  value={profile.niche || ""}
                  onChange={(e) => setProfile({ ...profile, niche: e.target.value })}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Target Region (For Local Memes)</label>
                <select
                  value={profile.region_code || "PK-KHI"}
                  onChange={(e) => setProfile({ ...profile, region_code: e.target.value })}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="PK-KHI">Pakistan - Karachi (PK-KHI)</option>
                  <option value="PK-LHR">Pakistan - Lahore (PK-LHR)</option>
                  <option value="PK-ISB">Pakistan - Islamabad (PK-ISB)</option>
                  <option value="UAE-DXB">UAE - Dubai (UAE-DXB)</option>
                  <option value="GLOBAL">Global English Memes</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400">Language Style</label>
                <select
                  value={profile.language_style || "Roman Urdu + English"}
                  onChange={(e) => setProfile({ ...profile, language_style: e.target.value })}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="Roman Urdu + English">Roman Urdu + English (Natural Desi Mix)</option>
                  <option value="Pure Witty English">Pure Witty English</option>
                  <option value="Punjabi-Touch Roman Urdu">Punjabi-Touch Roman Urdu</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-400">Current Product / Offer to Promote</label>
              <input
                placeholder="e.g., Midnight Deal 2 Zingers for Rs. 999"
                value={profile.product_focus || ""}
                onChange={(e) => setProfile({ ...profile, product_focus: e.target.value })}
                className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 px-6 py-2.5 rounded-xl font-semibold text-sm">
              Save Brand DNA
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
