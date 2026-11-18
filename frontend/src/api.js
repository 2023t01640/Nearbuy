let token = null,
  refreshing = null;
const events = new EventTarget();
export const onAuth = (fn) => {
  const listener = (e) => fn(e.detail);
  events.addEventListener("auth", listener);
  return () => events.removeEventListener("auth", listener);
};
export const getToken = () => token;
export function acceptSession(data) {
  token = data?.accessToken || null;
  events.dispatchEvent(new CustomEvent("auth", { detail: data?.user || null }));
}
export async function refresh() {
  if (!refreshing)
    refreshing = fetch("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "include",
      headers: { "X-NearBuy-CSRF": "1" },
    })
      .then(async (r) => {
        if (!r.ok) {
          acceptSession(null);
          return null;
        }
        const d = await r.json();
        acceptSession(d);
        return d;
      })
      .finally(() => {
        refreshing = null;
      });
  return refreshing;
}
export async function api(
  path,
  { method = "GET", body, raw = false, retry = true } = {},
) {
  const form = body instanceof FormData;
  const response = await fetch("/api/v1" + path, {
    method,
    credentials: "include",
    headers: {
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(!form && body ? { "Content-Type": "application/json" } : {}),
      "X-NearBuy-CSRF": "1",
    },
    body: body ? (form ? body : JSON.stringify(body)) : undefined,
  });
  if (response.status === 401 && retry && !path.startsWith("/auth/")) {
    if (await refresh()) return api(path, { method, body, raw, retry: false });
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      data.details?.map((d) => d.field + ": " + d.message).join("; ") ||
        data.error ||
        "Request failed",
    );
  }
  if (raw) return response;
  return response.status === 204 ? null : response.json();
}
export async function downloadReport(path) {
  const r = await api("/reports/" + path, { raw: true }),
    blob = await r.blob(),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download =
    r.headers.get("content-disposition")?.match(/filename="?([^";]+)/)?.[1] ||
    "report";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
