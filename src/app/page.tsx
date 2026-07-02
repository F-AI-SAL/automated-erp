"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, getTokens, clearTokens, AuthExpiredError } from "./ui/api";
import type { DashboardData } from "./ui/types";
import { Login } from "./ui/Login";
import { Dashboard } from "./ui/Dashboard";

type View = "loading" | "login" | "ready";

export default function Home() {
  const [view, setView] = useState<View>("loading");
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async (branchId?: string) => {
    try {
      const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
      const d = await apiGet<DashboardData>(`/api/dashboard${qs}`);
      setData(d);
      setView("ready");
    } catch (e) {
      if (e instanceof AuthExpiredError) {
        setView("login");
      } else {
        setError(e instanceof Error ? e.message : "লোড ব্যর্থ");
        setView("ready");
      }
    }
  }, []);

  useEffect(() => {
    if (getTokens().access) load();
    else setView("login");
  }, [load]);

  const logout = () => {
    clearTokens();
    setData(null);
    setView("login");
  };

  if (view === "loading") {
    return <div className="center-note"><div className="spinner" />লোড হচ্ছে…</div>;
  }
  if (view === "login") {
    return <Login onSuccess={() => { setView("loading"); load(); }} />;
  }
  if (error) {
    return <div className="center-note">⚠️ {error} <br /><br /><button className="logout" style={{ background: "#0d9488" }} onClick={logout}>আবার লগইন</button></div>;
  }
  if (!data) return <div className="center-note"><div className="spinner" />…</div>;

  return <Dashboard data={data} onBranchChange={(id) => { setView("loading"); load(id); }} onLogout={logout} />;
}
