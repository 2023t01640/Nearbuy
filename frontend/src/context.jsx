import React, { createContext, useContext, useState, useEffect } from "react";
import { api, onAuth, refresh } from "./api";
import { io } from "socket.io-client";
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
    const socket = io("/marketplace");
    socket.on("seller-verification-changed", (update) => {
      setListings((items) =>
        items.map((item) =>
          item.seller_id === update.sellerId
            ? { ...item, verification_status: update.verification_status }
            : item,
        ),
      );
      window.dispatchEvent(
        new CustomEvent("nearbuy:verification", { detail: update }),
      );
    });
    socket.on("connect", () => {
      reload();
      window.dispatchEvent(new Event("nearbuy:verification"));
    });
    return () => socket.disconnect();
  }, []);
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
