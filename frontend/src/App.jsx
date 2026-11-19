import { ProductOptions, FeePreview, validSelection } from "./ProductOptions";
import {
  BuyerMenu,
  Cart,
  BuyerOrders,
  BuyerSettings,
  AddToCart,
} from "./Buyer";
import ListingEditor from "./ListingEditor";
import { BuyNow, ProductMenu } from "./Commerce";
import Registration from "./Registration";
import React, { useState, useEffect, useId } from "react";
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
  UserRound,
  Eye,
  EyeOff,
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
        <Link className="header-brand" to="/">
          <span className="brand">
            <span className="brand-icon">
              <MapPin size={23} />
            </span>
            nearbuy.
          </span>
          <span className="brand-tagline">
            Local Listings | Direct Chat | Verified Reviews
          </span>
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
              {session.role === "buyer" ? (
                <BuyerMenu />
              ) : (
                <span className="user-name">
                  {session.name}
                  <small>{session.role}</small>
                </span>
              )}

              <button
                className="btn primary"
                aria-label="Logout"
                onClick={async () => {
                  try {
                    await api("/auth/logout", { method: "POST" });
                    acceptSession(null);
                  } catch (e) {
                    notify(e.message);
                  }
                }}
              >
                <LogOut size={18} /> Logout
              </button>
            </>
          ) : (
            <Link to="/login">Log in</Link>
          )}
          {!session && (
            <Link className="btn primary" to="/register">
              Register
            </Link>
          )}
        </div>
      </header>
      {!ready ? (
        <main className="empty">Connecting to NearBuy…</main>
      ) : (
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Auth />} />
          <Route
            path="/register"
            element={<Registration PasswordInput={PasswordInput} />}
          />
          <Route path="/listing/:id" element={<Details />} />
          <Route
            path="/cart"
            element={
              <Gate role="buyer">
                <Cart />
              </Gate>
            }
          />
          <Route
            path="/orders"
            element={
              <Gate role="buyer">
                <BuyerOrders />
              </Gate>
            }
          />
          <Route
            path="/settings"
            element={
              <Gate role="buyer">
                <BuyerSettings PasswordInput={PasswordInput} />
              </Gate>
            }
          />
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
function PasswordInput({ visibilityLabel = "password", ...props }) {
  const [visible, setVisible] = useState(false);
  const inputId = useId();
  const Icon = visible ? EyeOff : Eye;
  return (
    <span className="password-input">
      <input {...props} id={inputId} type={visible ? "text" : "password"} />
      <button
        className="password-toggle"
        type="button"
        aria-label={`${visible ? "Hide" : "Show"} ${visibilityLabel}`}
        aria-controls={inputId}
        onClick={() => setVisible((value) => !value)}
      >
        <Icon size={18} aria-hidden="true" />
      </button>
    </span>
  );
}
function Auth() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const data = new FormData(e.currentTarget);
    try {
      if (getToken()) {
        await api("/auth/logout", { method: "POST" });
        acceptSession(null);
      }
      const session = await api("/auth/login", {
        method: "POST",
        body: { email: data.get("email"), password: data.get("password") },
      });
      acceptSession(session);
      navigate(
        session.user.role === "admin"
          ? "/admin"
          : session.user.role === "seller"
            ? "/seller"
            : "/",
      );
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
        <h2>Welcome back</h2>
        <p>Sign in to your account.</p>
        <form onSubmit={submit}>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <PasswordInput
              name="password"
              autoComplete="current-password"
              maxLength={128}
              required
            />
          </label>
          <ErrorBox error={error} />
          <button className="btn primary full" disabled={busy}>
            {busy ? "Please wait..." : "Log in"} <ArrowRight size={16} />
          </button>
        </form>
        <p className="auth-foot">
          <Link to="/register">New around here? Create an account</Link>
        </p>
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
  useEffect(() => {
    if (p && window.location.hash === "#reviews")
      document
        .getElementById("reviews")
        ?.scrollIntoView({ behavior: "smooth" });
  }, [p?.id]);
  const [selection, setSelection] = useState({
    quantity: 1,
    selected_variants: {},
  });
  useEffect(() => setSelection({ quantity: 1, selected_variants: {} }), [id]);
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
    const update = () => load();
    window.addEventListener("nearbuy:verification", update);
    return () => window.removeEventListener("nearbuy:verification", update);
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
      <div className="section-title">
        <div className="breadcrumb">
          <Link to="/">Marketplace</Link> / {p.category} / {p.title}
        </div>
        <ProductMenu product={p} />
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
            <p>
              <b>Size &amp; Weight:</b> {p.size_weight || "Not provided"}
            </p>
            <p>
              <b>Payment methods:</b>{" "}
              {(p.payment_methods || []).join(" · ") || "Not provided"}
            </p>
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
            {Object.keys(p.specs || {}).length > 0 && (
              <dl className="product-specs">
                {Object.entries(p.specs).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
          <section className="panel reviews" id="reviews">
            {!p.can_review && (
              <p className="notice">
                Only logged-in buyers who have placed an order for this product
                using Buy Now can submit a review.
              </p>
            )}
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
                No reviews yet. Buyers can review after placing an order with
                Buy Now.
              </p>
            )}
            {reviews.map((r) => (
              <div className="review" key={r.id}>
                <div className="avatar">{r.name.slice(0, 2)}</div>
                <div>
                  <b>{r.name}</b>
                  <small>{"★".repeat(r.rating)}</small>
                  <span
                    className="badge green"
                    title={
                      r.verified_purchase
                        ? "This buyer placed an order for this product."
                        : "Review submitted before purchase verification was introduced."
                    }
                  >
                    {r.verified_purchase
                      ? "✓ Verified purchase"
                      : "Community review"}
                  </span>
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
            {session?.role === "buyer" && p.can_review && (
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
          <ProductOptions
            product={p}
            selection={selection}
            onChange={setSelection}
          />
          <BuyNow key={p.id} product={p} selection={selection} onOrder={load} />
          <AddToCart product={p} selection={selection} />
          <section className="panel seller-profile">
            <div className="avatar">{p.seller.slice(0, 2)}</div>
            <div>
              <div className="seller-name-badge">
                <b>{p.seller}</b>
                <small>
                  <span
                    className={
                      "badge " +
                      (p.verification_status === "verified" ? "green" : "amber")
                    }
                  >
                    {p.verification_status === "verified"
                      ? "✓ Verified Seller"
                      : "Not Verified"}
                  </span>
                </small>
              </div>
            </div>
            <p
              className="seller-overall-rating"
              aria-label={`Overall rating: ${p.seller_rating || "No ratings"} out of 5`}
            >
              <span className="rating">
                {p.seller_review_count
                  ? "★".repeat(Math.round(Number(p.seller_rating))) +
                    "☆".repeat(5 - Math.round(Number(p.seller_rating)))
                  : "☆☆☆☆☆"}
              </span>
              <br />
              Overall Rating:{" "}
              {p.seller_review_count
                ? `${Number(p.seller_rating).toFixed(1)} / 5 (${p.seller_review_count} reviews)`
                : "No reviews yet"}
            </p>
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
                      p.status !== "approved"
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
  const [orders, setOrders] = useState([]);
  async function load() {
    try {
      setMine(await api("/listings?mine=true"));
      setOrders(await api("/orders"));
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
          value={mine.filter((p) => p.status === "approved").length}
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
                <td>
                  {money(p.price)}
                  <FeePreview price={p.price} />
                </td>
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
                      disabled={p.status !== "approved"}
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
            Complete all product details to publish your first listing
            automatically.
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
      <section className="panel mt-6">
        <div className="section-title">
          <h2>Buyer orders</h2>
          <button className="btn compact" onClick={load}>
            Refresh orders
          </button>
        </div>
        {orders.length ? (
          orders.map((o) => (
            <div className="review" key={o.id}>
              <div>
                <Link to={"/listing/" + o.listing_id}>
                  <b>{o.product_name}</b>
                </Link>
                <p>
                  {o.buyer_name} | Quantity: {o.quantity} | {money(o.total)} |{" "}
                  {o.payment_method}
                </p>
                <p>Delivery: {o.address}</p>
                <p>
                  Options:{" "}
                  {Object.entries(o.selected_variants || {})
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(", ") || "Standard"}
                </p>
                <p>
                  Platform fee (7%): {money(o.platform_fee)} | Net payout:{" "}
                  {money(o.net_payout)}
                </p>
                <small>
                  Order {o.id} | Payment: {o.payment_status}
                </small>
                <label>
                  Order status
                  <select
                    value={o.status}
                    onChange={async (e) => {
                      try {
                        await api("/orders/" + o.id + "/status", {
                          method: "PATCH",
                          body: { status: e.target.value },
                        });
                        await load();
                        notify("Order status updated");
                      } catch (e) {
                        setError(e.message);
                      }
                    }}
                  >
                    {["Pending", "Confirmed", "Packing", "Delivered"].map(
                      (status) => (
                        <option
                          key={status}
                          disabled={
                            status !== o.status &&
                            !(
                              o.status === "Pending" && status === "Confirmed"
                            ) &&
                            !(
                              o.status === "Confirmed" && status === "Packing"
                            ) &&
                            !(o.status === "Packing" && status === "Delivered")
                          }
                        >
                          {status}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>
            </div>
          ))
        ) : (
          <p>No orders yet.</p>
        )}
      </section>
      <section className="panel mt-6">
        <h2>Sales &amp; listing exports</h2>
        <p>
          Sales exports include order totals and statuses. Payment collection is
          not tracked.
        </p>
        <div className="actions">
          {["sales", "listings"].flatMap((kind) =>
            ["pdf", "csv"].map((format) => (
              <button
                className="btn"
                key={kind + format}
                onClick={() =>
                  downloadReport(`seller/${kind}/${format}`).catch((e) =>
                    setError(e.message),
                  )
                }
              >
                {kind} {format.toUpperCase()}
              </button>
            )),
          )}
        </div>
      </section>
      <Reports role="seller" />
      {editing && (
        <ListingEditor
          item={editing}
          categories={categoryRows}
          onClose={() => setEditing(null)}
          onSave={(result) => {
            setEditing(null);
            load();
            reload();
            notify(
              result.status === "approved"
                ? "Listing approved and published"
                : "Listing sent to admin approval",
            );
          }}
        />
      )}
    </main>
  );
}
function Verification() {
  const [devOtp, setDevOtp] = useState(null);
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
    window.addEventListener("nearbuy:verification", load);
    return () => window.removeEventListener("nearbuy:verification", load);
  }, []);
  useEffect(() => {
    if (!devOtp) return;
    const timer = setTimeout(() => setDevOtp(null), 600000);
    return () => clearTimeout(timer);
  }, [devOtp]);
  return (
    <section className="panel mb-6">
      <div className="section-title">
        <h2>Seller verification</h2>
        <span className="badge">{state?.verification_status || "Loading"}</span>
      </div>
      <ErrorBox error={error} />
      {message && <p role="status">{message}</p>}
      {devOtp && (
        <div className="dev-otp-preview" role="status">
          <strong>Dev Mode OTP Preview</strong>
          <code>{devOtp}</code>
          <small>Enter this code below. Expires in 10 minutes.</small>
        </div>
      )}
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
            Confirm your phone and submit your identity for admin review. Your
            listings display your verification status on Explore.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              setDevOtp(null);
              try {
                const d = new FormData(e.currentTarget);
                const result = await api("/verification", {
                  method: "POST",
                  body: d,
                });
                setMessage(result.message);
                setDevOtp(result.devOtp || null);
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
                </select>
              </label>
              <label>
                NIC Number
                <input
                  name="identity_number"
                  defaultValue={state?.identity_number || ""}
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
                defaultValue={state?.phone || ""}
                required
              />
            </label>
            <label>
              NIC Photo
              <input
                name="nic_photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required={!state?.has_nic_photo}
              />
              <small>
                {state?.has_nic_photo
                  ? "NIC photo saved. Upload only to replace it."
                  : "JPEG, PNG or WebP, maximum 5 MB."}
              </small>
            </label>
            <label>
              Business Registration (BR) Number
              <input
                name="br_number"
                minLength={3}
                maxLength={70}
                defaultValue={state?.br_number || ""}
                required
              />
            </label>
            <label>
              BR Photo
              <input
                name="br_photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
              />
              <small>
                JPEG, PNG or WebP, maximum 5 MB. Private admin review only.
              </small>
            </label>
            <label className="legal-agreement">
              <input
                type="checkbox"
                name="legal_agreement"
                value="agree"
                required
              />
              I agree that illegal activity results in legal action and a
              permanent account ban.
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
                setDevOtp(null);
                setError("");
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
    "Listing approvals": "listing-approvals",
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
        {tab === "Listing approvals" ? (
          <div className="p-5">
            {data.map((p) => (
              <form
                key={p.id}
                className="panel mb-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget);
                  action("/admin/listing-approvals/" + p.id, {
                    decision: d.get("decision"),
                    note: d.get("note"),
                  });
                }}
              >
                <h3>{p.title || "Untitled listing"}</h3>
                <p>Seller: {p.seller}</p>
                <p className="notice">
                  Missing: {p.missing_details?.join(", ") || "None"}
                </p>
                <Link to={"/listing/" + p.id}>Inspect listing and photos</Link>
                <p>{p.description || "No description"}</p>
                <p>
                  Size &amp; Weight: {p.size_weight || "Not provided"} |
                  Category: {p.category || "Not provided"} | Condition:{" "}
                  {p.condition || "Not provided"}
                </p>
                <p>
                  Price: {p.price ? money(p.price) : "Not provided"} | Payment:{" "}
                  {p.payment_methods?.join(", ") || "Not provided"}
                </p>
                <label>
                  Decision
                  <select name="decision">
                    <option value="approved">Approve</option>
                    <option value="removed">Reject and remove</option>
                  </select>
                </label>
                <label>
                  Decision note
                  <input name="note" minLength={3} maxLength={300} required />
                </label>
                <button className="btn primary">Save decision</button>
              </form>
            ))}
            {!data.length && (
              <p className="empty">No listings awaiting approval.</p>
            )}
          </div>
        ) : tab === "Verifications" ? (
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
                <p>BR Number: {u.br_number || "Not provided"}</p>
                <p>
                  Category: {u.product_category || "Not provided"} | District:{" "}
                  {u.district || "Not provided"}
                </p>
                <p>Address: {u.address || "Not provided"}</p>
                <p>
                  Seller terms:{" "}
                  {u.seller_terms_at ? "Agreed" : "Legacy account"} | Legal
                  agreement: {u.legal_agreement_at ? "Agreed" : "Not recorded"}
                </p>
                <div className="identity-documents">
                  <IdentityDocument
                    userId={u.id}
                    kind="nic"
                    available={u.has_nic_photo}
                  />
                  <IdentityDocument
                    userId={u.id}
                    kind="br"
                    available={u.has_br_photo}
                  />
                </div>
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

function IdentityDocument({ userId, kind, available }) {
  const [image, setImage] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div>
      <button
        className="btn"
        type="button"
        disabled={!available || busy}
        onClick={async () => {
          if (image) {
            setImage(null);
            return;
          }
          setBusy(true);
          setError("");
          try {
            setImage(
              (await api(`/admin/verifications/${userId}/documents/${kind}`))
                .image,
            );
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Loading..." : image ? "Hide" : available ? "Inspect" : "No"}{" "}
        {kind.toUpperCase()} photo
      </button>
      <ErrorBox error={error} />
      {image && (
        <img
          className="identity-photo"
          src={image}
          alt={`${kind.toUpperCase()} document submitted for verification`}
        />
      )}
    </div>
  );
}
