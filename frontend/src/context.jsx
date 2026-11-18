import React, { createContext, useContext, useState, useEffect } from "react";
import { api, onAuth, refresh } from "./api";
const Context = createContext();
export const useApp = () => useContext(Context);
export function Provider({ children }) {
  const [session, setSession] = useState(null),
    [ready, setReady] = useState(false),
    [listings, setListings] = useState([]),
    [categoryRows, setCategoryRows] = useState([]),
    [toast, setToast] = useState(""),
    [error, setError] = useState("");
  const [saved, setSaved] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("nb-saved-api") || "[]");
    } catch {
      return [];
    }
  });
  useEffect(() => {
    localStorage.setItem("nb-saved-api", JSON.stringify(saved));
  }, [saved]);
  useEffect(() => onAuth(setSession), []);
  useEffect(() => {
    refresh()
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  async function reload() {
    try {
      const [p, c] = await Promise.all([api("/listings"), api("/categories")]);
      setListings(p);
      setCategoryRows(c);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    if (ready) reload();
  }, [ready, session?.id]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <Context.Provider
      value={{
        session,
        ready,
        listings,
        categoryRows,
        categories: ["All items", ...categoryRows.map((c) => c.name)],
        saved,
        setSaved,
        reload,
        notify: setToast,
      }}
    >
      {error && (
        <div className="error" role="alert">
          API unavailable: {error} <button onClick={reload}>Retry</button>
        </div>
      )}
      {children}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </Context.Provider>
  );
}
