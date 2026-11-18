import React, { useState, useEffect } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  NavLink,
  useNavigate,
  useParams,
  useLocation,
} from "react-router-dom";
import {
  MapPin,
  Plus,
  LogOut,
  ArrowRight,
  ShieldCheck,
  Send,
  Star,
  Download,
  Pencil,
  Check,
  X,
  Package,
  MessageCircle,
} from "lucide-react";
import { io } from "socket.io-client";
import { Provider, useApp } from "./context";
import { api, acceptSession, getToken, refresh, downloadReport } from "./api";
import { Home, ProductImage } from "./Marketplace";
import { money } from "./data";
export default function App() {
  return (
    <Provider>
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    </Provider>
  );
}
function Layout() {
  const { session, ready, notify } = useApp();
  return (
    <>
      <header>
        <Link className="brand" to="/">
          <span className="brand-icon">
            <MapPin size={23} />
          </span>
          nearbuy.
        </Link>
        <nav>
          <NavLink to="/" end>
            Explore
          </NavLink>
          {session?.role === "seller" && (
            <NavLink to="/seller">Seller dashboard</NavLink>
          )}
          {session?.role === "admin" && (
            <NavLink to="/admin">Admin dashboard</NavLink>
          )}
        </nav>
        <div className="header-actions">
          {session ? (
            <>
              <span className="user-name">
                {session.name}
                <small>{session.role}</small>
              </span>
              <button
                className="icon-btn"
                aria-label="Sign out"
                onClick={async () => {
                  try {
                    await api("/auth/logout", { method: "POST" });
                    acceptSession(null);
                  } catch (e) {
                    notify(e.message);
                  }
                }}
              >
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <Link to="/login">Log in</Link>
          )}
          <Link
            className="btn primary"
            to={session?.role === "seller" ? "/seller?new=1" : "/register"}
          >
            <Plus size={17} /> Sell an item
          </Link>
        </div>
      </header>
      <div className="demo-strip">
        <span>NearBuy · Your local Sri Lankan marketplace</span>
        <span>Buy thoughtfully. Connect locally.</span>
      </div>
      {!ready ? (
        <main className="empty">Connecting to NearBuy…</main>
      ) : (
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/register" element={<Auth register />} />
          <Route path="/listing/:id" element={<Details />} />
          <Route
            path="/seller"
            element={
              <Gate role="seller">
                <Seller />
              </Gate>
            }
          />
          <Route
            path="/admin"
            element={
              <Gate role="admin">
                <Admin />
              </Gate>
            }
          />
          <Route
            path="*"
            element={
              <main className="empty">
                <h1>Page not found</h1>
                <Link to="/">Back to marketplace</Link>
              </main>
            }
          />
        </Routes>
      )}
      <footer>
        <Link className="brand" to="/">
          nearbuy.
        </Link>
        <span>A little closer. A little more local.</span>
        <span>Made for communities in Sri Lanka 🇱🇰</span>
      </footer>
    </>
  );
}
function ErrorBox({ error }) {
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : null;
}
function Gate({ role, children }) {
  const { session } = useApp();
  return session?.role === role ? (
    children
  ) : (
    <main className="page">
      <section className="panel gate">
        <ShieldCheck size={40} />
        <h1>{role} workspace</h1>
        <p>Sign in with a {role} account to continue.</p>
        <Link to="/login" className="btn primary">
          Log in
        </Link>
      </section>
    </main>
  );
}
function Auth({ register = false }) {
  const [role, setRole] = useState("buyer"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { notify } = useApp();
  async function submit(e) {
    e.preventDefault();
    setError("");
    const d = Object.fromEntries(new FormData(e.target));
    if (register && d.password !== d.confirm)
      return setError("Passwords do not match");
    setBusy(true);
    try {
      if (register) {
        await api("/auth/register", {
          method: "POST",
          body: { name: d.name, email: d.email, password: d.password, role },
        });
        notify("Account created. Sign in to continue.");
        navigate("/login");
      } else {
        const data = await api("/auth/login", {
          method: "POST",
          body: { email: d.email, password: d.password },
        });
        acceptSession(data);
        navigate(
          data.user.role === "admin"
            ? "/admin"
            : data.user.role === "seller"
              ? "/seller"
              : "/",
        );
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <div className="auth-story">
        <span className="eyebrow">FIND YOUR COMMUNITY</span>
        <h1>
          Great things.
          <br />
          Better neighbours.
        </h1>
        <p>Your next favourite could be just around the corner.</p>
        <div className="auth-illustration">
          <ShieldCheck size={70} />
          <span>
            Real people.
            <br />
            Local connections.
          </span>
        </div>
      </div>
      <section className="panel auth-form">
        <h2>{register ? "Join the neighbourhood" : "Welcome back"}</h2>
        <p>
          {register
            ? "Create your NearBuy account."
            : "Sign in to your account."}
        </p>
        {register && (
          <div className="role-switch">
            {["buyer", "seller"].map((r) => (
              <button
                key={r}
                className={role === r ? "active" : ""}
                onClick={() => setRole(r)}
              >
                {r}
              </button>
            ))}
          </div>
        )}
        <form key={String(register)} onSubmit={submit}>
          {register && (
            <label>
              Full name
              <input name="name" minLength={2} maxLength={70} required />
            </label>
          )}
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              minLength={register ? 12 : 1}
              maxLength={128}
              autoComplete={register ? "new-password" : "current-password"}
              required
            />
            {register && <small>At least 12 characters.</small>}
          </label>
          {register && (
            <label>
              Confirm password
              <input
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
              />
            </label>
          )}
          <ErrorBox error={error} />
          <button className="btn primary full" disabled={busy}>
            {busy ? "Please wait…" : register ? "Create account" : "Log in"}{" "}
            <ArrowRight size={16} />
          </button>
        </form>
        <p className="auth-foot">
          <Link
            to={register ? "/login" : "/register"}
            onClick={() => setError("")}
          >
            {register
              ? "Already registered? Log in"
              : "New around here? Create an account"}
          </Link>
        </p>
        {register && role === "seller" && (
          <div className="notice">
            Verify your identity and phone before your listings become public.
          </div>
        )}
      </section>
    </main>
  );
}
function Details() {
  const { id } = useParams();
  const { session, notify } = useApp();
  const [p, setP] = useState(null),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(0),
    [reviews, setReviews] = useState([]),
    [messages, setMessages] = useState([]),
    [draft, setDraft] = useState(""),
    [conversations, setConversations] = useState([]),
    [buyer, setBuyer] = useState(""),
    [sending, setSending] = useState(false);
  const isOwner = session?.id === p?.seller_id;
  const canChat =
    session?.role === "buyer" || (session?.role === "seller" && isOwner);
  const threadQuery = isOwner ? "?buyer_id=" + buyer : "";
  async function load() {
    try {
      const [item, r] = await Promise.all([
        api("/listings/" + id),
        api("/listings/" + id + "/reviews"),
      ]);
      setP(item);
      setReviews(r);
      setError("");
      if (session && ["seller", "buyer"].includes(session.role)) {
        const c = await api("/conversations");
        setConversations(c.filter((x) => x.listing_id === id));
      }
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    setSelected(0);
    setP(null);
    setMessages([]);
    setBuyer("");
    load();
  }, [id, session?.id]);
  useEffect(() => {
    if (!canChat || (isOwner && !buyer)) return;
    let active = true;
    const loadMessages = () =>
      api("/listings/" + id + "/messages" + threadQuery)
        .then((m) => {
          if (active) setMessages(m);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    loadMessages();
    const timer = setInterval(loadMessages, 8000);
    let socket = io({ auth: { token: getToken() }, reconnection: true });
    socket.on("message", (m) => {
      if (m.listing_id === id && (!isOwner || m.buyer_id === buyer))
        loadMessages();
    });
    socket.on("disconnect", async (reason) => {
      if (reason === "io server disconnect" && active) {
        const s = await refresh().catch(() => null);
        if (s && active) {
          socket.auth = { token: getToken() };
          socket.connect();
        }
      }
    });
    return () => {
      active = false;
      clearInterval(timer);
      socket.disconnect();
    };
  }, [id, canChat, isOwner, buyer]);
  async function send(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    try {
      await api("/listings/" + id + "/messages", {
        method: "POST",
        body: { text: draft, ...(isOwner ? { buyer_id: buyer } : {}) },
      });
      setDraft("");
      setMessages(await api("/listings/" + id + "/messages" + threadQuery));
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }
  if (!p)
    return (
      <main className="page">
        <ErrorBox error={error} />
        {!error && <p>Loading listing…</p>}
        <Link to="/">Back to marketplace</Link>
      </main>
    );
  return (
    <main className="page">
      <div className="breadcrumb">
        <Link to="/">Marketplace</Link> / {p.category} / {p.title}
      </div>
      <ErrorBox error={error} />
      <div className="detail-grid">
        <section>
          <div className="gallery-main">
            <ProductImage src={p.images[selected]} alt={p.title} />
            <span className="condition">{p.condition}</span>
          </div>
          <div className="thumbnails">
            {p.images.map((src, i) => (
              <button
                key={src}
                className={selected === i ? "selected" : ""}
                onClick={() => setSelected(i)}
                aria-label={"Photo " + (i + 1)}
              >
                <ProductImage src={src} alt={"View " + (i + 1)} />
              </button>
            ))}
          </div>
          <section className="panel">
            <h2>A little about this find</h2>
            <p>{p.description}</p>
            <div className="detail-specs">
              <span>
                Condition<b>{p.condition}</b>
              </span>
              <span>
                Category<b>{p.category}</b>
              </span>
              <span>
                Collection<b>{p.location}</b>
              </span>
            </div>
          </section>
          <section className="panel reviews">
            <h2>
              Peer reviews{" "}
              {reviews.length > 0 && (
                <span className="rating">
                  ★{" "}
                  {(
                    reviews.reduce((n, r) => n + r.rating, 0) / reviews.length
                  ).toFixed(1)}
                </span>
              )}
            </h2>
            {!reviews.length && (
              <p>
                No reviews yet. Buyers can review after starting a conversation.
              </p>
            )}
            {reviews.map((r) => (
              <div className="review" key={r.id}>
                <div className="avatar">{r.name.slice(0, 2)}</div>
                <div>
                  <b>{r.name}</b>
                  <small>{"★".repeat(r.rating)}</small>
                  <p>{r.text}</p>
                  {(session?.id === r.buyer_id ||
                    session?.role === "admin") && (
                    <button
                      className="text-btn"
                      onClick={async () => {
                        try {
                          await api("/reviews/" + r.id, { method: "DELETE" });
                          load();
                        } catch (e) {
                          setError(e.message);
                        }
                      }}
                    >
                      Delete review
                    </button>
                  )}
                </div>
              </div>
            ))}
            {session?.role === "buyer" && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget,
                    d = new FormData(form),
                    existing = reviews.find((r) => r.buyer_id === session.id);
                  try {
                    await api(
                      existing
                        ? "/reviews/" + existing.id
                        : "/listings/" + id + "/reviews",
                      {
                        method: existing ? "PATCH" : "POST",
                        body: {
                          rating: Number(d.get("rating")),
                          text: d.get("text"),
                        },
                      },
                    );
                    form.reset();
                    load();
                    notify("Review saved");
                  } catch (e) {
                    setError(e.message);
                  }
                }}
              >
                <label>
                  Your rating
                  <select name="rating">
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>
                        {n} stars
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Your experience
                  <textarea
                    required
                    minLength={3}
                    maxLength={700}
                    name="text"
                  />
                </label>
                <button className="btn">
                  {reviews.some((r) => r.buyer_id === session.id)
                    ? "Update your review"
                    : "Post review"}
                </button>
              </form>
            )}
          </section>
        </section>
        <aside>
          <span className="eyebrow">A FIND IN {p.location.toUpperCase()}</span>
          <h1 className="detail-title">{p.title}</h1>
          <div className="detail-price">{money(p.price)}</div>
          <p className="muted">
            <MapPin size={16} />
            {p.location}
          </p>
          <span className="badge green">{p.status}</span>
          <section className="panel seller-profile">
            <div className="avatar">{p.seller.slice(0, 2)}</div>
            <div>
              <b>{p.seller}</b>
              <small>
                {p.verification_status === "verified"
                  ? "✓ Verified Seller"
                  : "Seller verification pending"}
              </small>
            </div>
          </section>
          <section className="panel chat">
            <div className="chat-heading">
              <h3>Let’s talk about it</h3>
              <MessageCircle size={20} />
            </div>
            {!canChat ? (
              <p>
                <Link to="/login">Sign in as a buyer</Link> to contact this
                seller.
              </p>
            ) : (
              <>
                {isOwner && (
                  <label>
                    Buyer conversation
                    <select
                      value={buyer}
                      onChange={(e) => setBuyer(e.target.value)}
                    >
                      <option value="">Select a conversation</option>
                      {conversations.map((c) => (
                        <option key={c.buyer_id} value={c.buyer_id}>
                          {c.buyer_name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="chat-messages" aria-live="polite">
                  <div className="chat-start">
                    Private conversation · Live updates with polling fallback
                  </div>
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={
                        "message " +
                        (m.sender_id === session.id ? "buyer" : "seller")
                      }
                    >
                      {m.text}
                      <small>
                        {m.sender} · {new Date(m.time).toLocaleTimeString()}
                      </small>
                    </div>
                  ))}
                </div>
                <form className="chat-input" onSubmit={send}>
                  <input
                    aria-label="Message"
                    maxLength={1000}
                    placeholder="Write a message…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <button
                    aria-label="Send message"
                    className="btn primary"
                    disabled={
                      sending ||
                      !draft.trim() ||
                      (isOwner && !buyer) ||
                      p.status !== "active"
                    }
                  >
                    <Send size={18} />
                  </button>
                </form>
              </>
            )}
          </section>
          <div className="safety">
            <ShieldCheck />
            <p>
              <b>Keep it local. Keep it safe.</b>
              <br />
              Inspect the item before paying. A verified identity is not a
              product guarantee.
            </p>
          </div>
          {session && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await api("/listings/" + id + "/flag", {
                    method: "POST",
                    body: {
                      reason: new FormData(e.currentTarget).get("reason"),
                    },
                  });
                  notify("Report submitted");
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              <label className="mt-5">
                Report a concern
                <input name="reason" required minLength={5} maxLength={300} />
              </label>
              <button className="btn compact">Report listing</button>
            </form>
          )}
        </aside>
      </div>
    </main>
  );
}
function Seller() {
  const { session, categoryRows, reload, notify } = useApp();
  const [mine, setMine] = useState([]),
    [editing, setEditing] = useState(null),
    [error, setError] = useState(""),
    [conversations, setConversations] = useState([]);
  const location = useLocation();
  async function load() {
    try {
      setMine(await api("/listings?mine=true"));
      setConversations(await api("/conversations"));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (new URLSearchParams(location.search).has("new")) setEditing({});
  }, [location.search]);
  const sold = mine.filter((p) => p.status === "sold");
  return (
    <main className="page">
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">YOUR SELLER SPACE</span>
          <h1>Welcome back, {session.name.split(" ")[0]}.</h1>
          <p>A new chapter for the things you’ve loved.</p>
        </div>
        <button className="btn primary" onClick={() => setEditing({})}>
          <Plus size={18} /> Create listing
        </button>
      </div>
      <ErrorBox error={error} />
      <Verification />
      <div className="stats">
        <Stat
          label="Active listings"
          value={mine.filter((p) => p.status === "active").length}
        />
        <Stat label="Sold items" value={sold.length} />
        <Stat
          label="Sales value"
          value={money(sold.reduce((s, p) => s + p.price, 0))}
        />
        <Stat label="Conversations" value={conversations.length} />
      </div>
      <h2 className="mb-5 text-xl font-bold">Your listings</h2>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Price</th>
              <th>Status</th>
              <th>Manage</th>
            </tr>
          </thead>
          <tbody>
            {mine.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link className="table-product" to={"/listing/" + p.id}>
                    <ProductImage src={p.images[0]} alt="" />
                    <b>{p.title}</b>
                  </Link>
                </td>
                <td>{money(p.price)}</td>
                <td>
                  <span className="badge">{p.status}</span>
                </td>
                <td>
                  <div className="actions">
                    <button
                      className="btn compact"
                      disabled={["sold", "removed"].includes(p.status)}
                      onClick={() => setEditing(p)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn compact"
                      disabled={p.status !== "active"}
                      onClick={async () => {
                        try {
                          await api("/listings/" + p.id + "/sold", {
                            method: "PATCH",
                          });
                          load();
                          reload();
                        } catch (e) {
                          setError(e.message);
                        }
                      }}
                    >
                      Mark sold
                    </button>
                    <button
                      className="btn compact danger"
                      disabled={p.status === "removed"}
                      onClick={async () => {
                        try {
                          await api("/listings/" + p.id, { method: "DELETE" });
                          load();
                          reload();
                        } catch (e) {
                          setError(e.message);
                        }
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!mine.length && (
          <div className="empty">
            Create your first listing. It will remain a draft until you are
            verified.
          </div>
        )}
      </div>
      <section className="panel mt-6">
        <h2>Buyer conversations</h2>
        {conversations.length ? (
          conversations.map((c) => (
            <p key={c.listing_id + c.buyer_id}>
              <Link to={"/listing/" + c.listing_id}>
                {c.title} — {c.buyer_name} →
              </Link>
            </p>
          ))
        ) : (
          <p>No inquiries yet.</p>
        )}
      </section>
      <Reports role="seller" />
      {editing && (
        <ListingForm
          item={editing}
          categories={categoryRows}
          onClose={() => setEditing(null)}
          onSave={() => {
            setEditing(null);
            load();
            reload();
            notify("Listing saved");
          }}
        />
      )}
    </main>
  );
}
function Verification() {
  const [state, setState] = useState(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      setState(await api("/verification"));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <section className="panel mb-6">
      <div className="section-title">
        <h2>Seller verification</h2>
        <span className="badge">{state?.verification_status || "Loading"}</span>
      </div>
      <ErrorBox error={error} />
      {message && <p role="status">{message}</p>}
      {state?.verification_note && <p>Admin note: {state.verification_note}</p>}
      {state?.verification_status === "verified" ? (
        <p>✓ Verified Seller — your eligible listings are public.</p>
      ) : state?.verification_status === "pending" ? (
        <p>
          Your phone is confirmed. An admin will review your identity details.
        </p>
      ) : (
        <>
          <p>
            Submit your identity details, then confirm your phone number. Your
            listings stay in draft until approval.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const d = Object.fromEntries(new FormData(e.currentTarget));
                setMessage(
                  (await api("/verification", { method: "POST", body: d }))
                    .message,
                );
                load();
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="form-row">
              <label>
                ID type
                <select name="identity_type">
                  <option value="nic">Sri Lankan NIC</option>
                  <option value="business">Business registration</option>
                </select>
              </label>
              <label>
                NIC / Business ID
                <input
                  name="identity_number"
                  required
                  minLength={5}
                  maxLength={40}
                />
              </label>
            </div>
            <label>
              Phone (+94 format)
              <input
                name="phone"
                type="tel"
                pattern="\+94[1-9][0-9]{8}"
                placeholder="+94771234567"
                required
              />
            </label>
            <button className="btn" disabled={busy}>
              Submit and send phone code
            </button>
          </form>
          <form
            className="mt-5"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                setMessage(
                  (
                    await api("/verification/confirm-phone", {
                      method: "POST",
                      body: { code: new FormData(e.currentTarget).get("code") },
                    })
                  ).message,
                );
                load();
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            <label>
              Phone verification code
              <input
                name="code"
                pattern="[0-9]{6}"
                inputMode="numeric"
                required
                maxLength={6}
              />
            </label>
            <button className="btn primary">Confirm phone</button>
          </form>
        </>
      )}
    </section>
  );
}
function ListingForm({ item, categories, onClose, onSave }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      let images = (item.images || []).filter((i) => i.startsWith("/uploads/"));
      const files = data.getAll("images").filter((f) => f.size);
      if (files.length > 6) throw new Error("Maximum 6 images");
      if (files.length) {
        images = [];
        for (const f of files) {
          if (f.size > 5 * 1024 * 1024)
            throw new Error("Images must be 5 MB or smaller");
          const form = new FormData();
          form.append("image", f);
          images.push(
            (await api("/uploads", { method: "POST", body: form })).url,
          );
        }
      }
      const b = {
        title: data.get("title"),
        description: data.get("description"),
        price: Number(data.get("price")),
        location: data.get("location"),
        category_id: Number(data.get("category_id")),
        condition: data.get("condition"),
        images,
      };
      await api(item.id ? "/listings/" + item.id : "/listings", {
        method: item.id ? "PUT" : "POST",
        body: b,
      });
      onSave();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-title"
      >
        <div className="section-title">
          <h2 id="editor-title">
            {item.id ? "Edit listing" : "Create a local find"}
          </h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X />
          </button>
        </div>
        <form onSubmit={submit}>
          <label>
            Title
            <input
              name="title"
              required
              minLength={3}
              maxLength={100}
              defaultValue={item.title}
            />
          </label>
          <div className="form-row">
            <label>
              Price (LKR)
              <input
                type="number"
                name="price"
                min="1"
                max="9999999999"
                step="0.01"
                required
                defaultValue={item.price}
              />
            </label>
            <label>
              Category
              <select name="category_id" defaultValue={item.category_id}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-row">
            <label>
              Location
              <input
                name="location"
                minLength={2}
                maxLength={60}
                required
                defaultValue={item.location}
              />
            </label>
            <label>
              Condition
              <select name="condition" defaultValue={item.condition || "Good"}>
                {["New", "Like new", "Good", "Fair"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Images (up to 6; JPEG/PNG/WebP; 5 MB each)
            <input
              type="file"
              name="images"
              accept="image/jpeg,image/png,image/webp"
              multiple
            />
            <small>
              New uploads replace the existing gallery. Leave empty to keep it.
            </small>
          </label>
          <label>
            Description
            <textarea
              name="description"
              required
              minLength={15}
              maxLength={2000}
              defaultValue={item.description}
            />
          </label>
          <ErrorBox error={error} />
          <button className="btn primary full" disabled={busy}>
            {busy ? "Saving…" : "Save listing"}
          </button>
        </form>
      </section>
    </div>
  );
}
function Stat({ label, value }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>From your marketplace activity</small>
    </div>
  );
}
function Reports({ role }) {
  const { notify } = useApp();
  const [month, setMonth] = useState(
      new Date()
        .toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" })
        .slice(0, 7),
    ),
    [date, setDate] = useState(
      new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" }),
    );
  const items =
    role === "seller"
      ? [
          ["Monthly sales", "monthly-sales", "PDF", true],
          ["Daily inquiries", "daily-inquiries", "CSV", false],
        ]
      : [
          ["Daily activity", "daily-activity", "PDF", false],
          ["Monthly audit logs", "monthly-audit", "CSV", true],
        ];
  return (
    <div className="reports-grid">
      {items.map(([title, path, format, monthly]) => (
        <section className="report" key={path}>
          <div className="report-icon">
            <Download />
          </div>
          <div>
            <h3>{title}</h3>
            <label className="mt-3">
              Reporting {monthly ? "month" : "date"}
              <input
                type={monthly ? "month" : "date"}
                value={monthly ? month : date}
                onChange={(e) =>
                  monthly ? setMonth(e.target.value) : setDate(e.target.value)
                }
              />
            </label>
          </div>
          <button
            className="btn"
            disabled={!(monthly ? month : date)}
            onClick={() =>
              downloadReport(
                role +
                  "/" +
                  path +
                  "?" +
                  (monthly ? "month=" : "date=") +
                  (monthly ? month : date),
              ).catch((e) => notify(e.message))
            }
          >
            Download {format}
          </button>
        </section>
      ))}
    </div>
  );
}
function Admin() {
  const { notify, reload } = useApp();
  const [tab, setTab] = useState("Verifications"),
    [data, setData] = useState([]),
    [stats, setStats] = useState({}),
    [error, setError] = useState("");
  const paths = {
    Verifications: "verifications",
    Users: "users",
    "Flagged listings": "flags",
    "Audit logs": "audit",
    Categories: null,
  };
  async function load() {
    try {
      const [s, d] = await Promise.all([
        api("/admin/stats"),
        api(tab === "Categories" ? "/categories" : "/admin/" + paths[tab]),
      ]);
      setStats(s);
      setData(d);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    setData([]);
    load();
  }, [tab]);
  async function action(path, body, method = "PATCH") {
    try {
      await api(path, { method, body });
      notify("Change saved");
      load();
      reload();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <main className="page">
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">COMMUNITY CARE</span>
          <h1>Admin dashboard</h1>
          <p>Keep the neighbourhood a good place to trade.</p>
        </div>
      </div>
      <ErrorBox error={error} />
      <div className="stats">
        <Stat label="Members" value={stats.users || 0} />
        <Stat label="Active listings" value={stats.listings || 0} />
        <Stat label="Pending flags" value={stats.flags || 0} />
        <Stat label="Audit events" value={stats.events || 0} />
      </div>
      <div className="tabs overflow-x-auto">
        {Object.keys(paths).map((t) => (
          <button
            className={t === tab ? "active" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <section className="panel table-wrap">
        {tab === "Verifications" ? (
          <div className="p-5">
            {data.map((u) => (
              <form
                key={u.id}
                className="panel mb-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget);
                  action("/admin/verifications/" + u.id, {
                    decision: d.get("decision"),
                    note: d.get("note"),
                  });
                }}
              >
                <h3 className="font-bold">
                  {u.name} · {u.email}
                </h3>
                <p>
                  {u.identity_type.toUpperCase()}: {u.identity_number}
                </p>
                <p>
                  Phone: {u.phone} ·{" "}
                  {u.phone_verified ? "Confirmed" : "Unconfirmed"}
                </p>
                <label>
                  Decision
                  <select name="decision">
                    <option value="verified">Approve</option>
                    <option value="rejected">Reject</option>
                  </select>
                </label>
                <label>
                  Decision note
                  <input name="note" required minLength={3} maxLength={300} />
                </label>
                <button className="btn primary">Save decision</button>
              </form>
            ))}
            {!data.length && (
              <div className="empty">No pending verification requests.</div>
            )}
          </div>
        ) : tab === "Users" ? (
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Status</th>
                <th>Manage</th>
              </tr>
            </thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.name}
                    <small>{u.email}</small>
                  </td>
                  <td>{u.role}</td>
                  <td>{u.status}</td>
                  <td>
                    {u.role !== "admin" && (
                      <div className="actions">
                        <button
                          className="btn compact"
                          onClick={() =>
                            action("/admin/users/" + u.id, {
                              status:
                                u.status === "active" ? "suspended" : "active",
                            })
                          }
                        >
                          {u.status === "active" ? "Suspend" : "Reactivate"}
                        </button>
                        <select
                          aria-label={"Role for " + u.name}
                          value={u.role}
                          onChange={(e) =>
                            action("/admin/users/" + u.id, {
                              role: e.target.value,
                            })
                          }
                        >
                          <option>buyer</option>
                          <option>seller</option>
                          <option>admin</option>
                        </select>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : tab === "Flagged listings" ? (
          <table>
            <thead>
              <tr>
                <th>Listing</th>
                <th>Reason</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={"/listing/" + p.id}>{p.title}</Link>
                    <small>{p.seller}</small>
                  </td>
                  <td>{p.flag_reason}</td>
                  <td>
                    <div className="actions">
                      <button
                        className="btn compact"
                        onClick={() =>
                          action("/admin/flags/" + p.id, {
                            decision: "approve",
                          })
                        }
                      >
                        Approve
                      </button>
                      <button
                        className="btn compact danger"
                        onClick={() =>
                          action("/admin/flags/" + p.id, { decision: "remove" })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : tab === "Audit logs" ? (
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
              </tr>
            </thead>
            <tbody>
              {data.map((l) => (
                <tr key={l.id}>
                  <td>{new Date(l.time).toLocaleString()}</td>
                  <td>{l.actor}</td>
                  <td>{l.action}</td>
                  <td>{l.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-5">
            {data.map((c) => (
              <form
                className="actions mb-3"
                key={c.id}
                onSubmit={(e) => {
                  e.preventDefault();
                  action("/categories/" + c.id, {
                    name: new FormData(e.currentTarget).get("name"),
                  });
                }}
              >
                <input
                  aria-label="Category name"
                  name="name"
                  required
                  minLength={2}
                  maxLength={60}
                  defaultValue={c.name}
                />
                <button className="btn compact">Rename</button>
                <button
                  className="btn compact danger"
                  type="button"
                  onClick={() =>
                    action("/categories/" + c.id, undefined, "DELETE")
                  }
                >
                  Delete
                </button>
              </form>
            ))}
            <form
              className="actions"
              onSubmit={(e) => {
                e.preventDefault();
                action(
                  "/categories",
                  { name: new FormData(e.currentTarget).get("name") },
                  "POST",
                );
              }}
            >
              <input
                name="name"
                aria-label="New category"
                placeholder="New category"
                required
                minLength={2}
                maxLength={60}
              />
              <button className="btn">Add category</button>
            </form>
          </div>
        )}
      </section>
      <Reports role="admin" />
    </main>
  );
}
