import { CardFields, validSelection } from "./ProductOptions";
import React, { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserRound } from "lucide-react";
import { api, acceptSession, refresh } from "./api";
import { useApp } from "./context";
import { money } from "./data";
export function BuyerMenu() {
  const { session } = useApp(),
    [profile, setProfile] = useState(null);
  const menu = useRef();
  useEffect(() => {
    const dismiss = (e) => {
      if (menu.current && !menu.current.contains(e.target))
        menu.current.open = false;
    };
    const escape = (e) => {
      if (e.key === "Escape" && menu.current) {
        menu.current.open = false;
        menu.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  useEffect(() => {
    const load = () =>
      api("/profile")
        .then(setProfile)
        .catch(() => {});
    load();
    window.addEventListener("nearbuy:profile", load);
    return () => window.removeEventListener("nearbuy:profile", load);
  }, [session?.id]);
  return (
    <details ref={menu} className="product-menu buyer-menu">
      <summary aria-label="Buyer profile menu">
        <UserRound size={22} />
      </summary>
      <div className="panel product-menu-options">
        <strong>{profile?.name || session.name}</strong>
        <p>{profile?.address || "Add a delivery address in Settings"}</p>
        {["Cart", "Orders", "Settings"].map((page) => (
          <Link
            key={page}
            to={"/" + page.toLowerCase()}
            onClick={() => (menu.current.open = false)}
          >
            {page}
          </Link>
        ))}
      </div>
    </details>
  );
}
export function AddToCart({ product, selection }) {
  const { session, notify } = useApp();
  const [busy, setBusy] = useState(false);
  return session?.role === "buyer" ? (
    <button
      className="btn full"
      disabled={
        busy ||
        product.status !== "approved" ||
        product.can_review ||
        !validSelection(product, selection)
      }
      onClick={async () => {
        setBusy(true);
        try {
          await api("/cart/" + product.id, {
            method: "PUT",
            body: selection,
          });
          notify("Added to cart");
        } catch (e) {
          notify(e.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      Add to cart
    </button>
  ) : null;
}
export function Cart() {
  const [payments, setPayments] = useState({});
  const online = Object.values(payments).includes("Online Payment");
  const [items, setItems] = useState([]),
    [address, setAddress] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false);
  const navigate = useNavigate(),
    { notify } = useApp();
  async function load() {
    try {
      setItems(await api("/cart"));
      setReady(true);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
    api("/profile")
      .then((p) => setAddress(p.address))
      .catch((e) => setError(e.message));
  }, []);
  async function update(item, quantity) {
    setBusy(true);
    setError("");
    try {
      await api("/cart/" + item.listing_id, {
        method: quantity ? "PUT" : "DELETE",
        ...(quantity
          ? { body: { quantity, selected_variants: item.selected_variants } }
          : {}),
      });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="page">
      <h1>Your cart</h1>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!ready ? (
        <p>Loading cart...</p>
      ) : !items.length ? (
        <section className="panel">
          <p>Your cart is empty.</p>
          <Link to="/">Explore listings</Link>
        </section>
      ) : (
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              await api("/cart/checkout", {
                method: "POST",
                body: {
                  address,
                  card_simulation: online,
                  payments: Object.fromEntries(
                    items.map((i) => [i.listing_id, d.get(i.listing_id)]),
                  ),
                },
              });
              notify("Orders placed");
              navigate("/orders");
            } catch (e) {
              setError(e.message);
              await load();
            } finally {
              setBusy(false);
            }
          }}
        >
          {items.map((item) => (
            <div className="cart-item" key={item.listing_id}>
              <img
                src={item.images[0] || "/placeholder.svg"}
                alt={item.title}
              />
              <div>
                <Link to={"/listing/" + item.listing_id}>
                  <b>{item.title}</b>
                </Link>
                <p>
                  {item.seller} · {money(item.price)}
                </p>
                <p>
                  {Object.entries(item.selected_variants || {})
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ") || "Standard variant"}{" "}
                  | {item.stock_quantity} in stock
                </p>
                {!validSelection(item, {
                  quantity: item.quantity,
                  selected_variants: item.selected_variants,
                }) && (
                  <p className="error">
                    Stock or options changed. Update quantity or re-add this
                    product with available options.
                  </p>
                )}
                {(item.status !== "approved" ||
                  item.seller_status !== "active") && (
                  <p className="error">
                    Unavailable — remove this item before checkout.
                  </p>
                )}
                <label>
                  Quantity
                  <select
                    aria-label={"Quantity for " + item.title}
                    value={item.quantity}
                    disabled={busy}
                    onChange={(e) => update(item, Number(e.target.value))}
                  >
                    {Array.from(
                      { length: Math.min(item.stock_quantity, 99) },
                      (_, i) => (
                        <option key={i + 1}>{i + 1}</option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Payment method
                  <select
                    name={item.listing_id}
                    required
                    value={payments[item.listing_id] || ""}
                    onChange={(e) =>
                      setPayments((p) => ({
                        ...p,
                        [item.listing_id]: e.target.value,
                      }))
                    }
                  >
                    <option value="" disabled>
                      Select payment
                    </option>
                    {item.payment_methods.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="text-btn"
                  disabled={busy}
                  onClick={() => update(item, 0)}
                >
                  Remove
                </button>
              </div>
              <strong>{money(Number(item.price) * item.quantity)}</strong>
            </div>
          ))}
          {items.some((i) => payments[i.listing_id] === "Online Payment") && (
            <CardFields />
          )}
          <h2>
            Total:{" "}
            {money(items.reduce((n, i) => n + Number(i.price) * i.quantity, 0))}
          </h2>
          <label>
            Confirm delivery address
            <textarea
              required
              minLength={10}
              maxLength={500}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>
          <p>
            No payment is collected here. Delivery and online payment
            arrangements must be confirmed with each seller.
          </p>
          <button
            className="btn primary"
            disabled={
              busy ||
              items.some(
                (i) =>
                  !validSelection(i, {
                    quantity: i.quantity,
                    selected_variants: i.selected_variants,
                  }) ||
                  i.status !== "approved" ||
                  i.seller_status !== "active" ||
                  !i.price ||
                  !i.payment_methods.length,
              )
            }
          >
            {busy ? "Please wait..." : "Place orders"}
          </button>
        </form>
      )}
    </main>
  );
}
export function BuyerOrders() {
  const [orders, setOrders] = useState([]),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false);
  async function load() {
    try {
      setOrders(await api("/orders"));
      setReady(true);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);
  return (
    <main className="page">
      <div className="section-title">
        <h1>Your orders</h1>
        <button className="btn" onClick={load}>
          Refresh
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!ready ? (
        <p>Loading orders...</p>
      ) : !orders.length ? (
        <p className="panel">
          No orders yet. <Link to="/">Explore listings</Link>
        </p>
      ) : (
        orders.map((o) => (
          <section key={o.id} className="panel mb-4">
            <div className="section-title">
              <h2>{o.product_name}</h2>
              <span className="badge">{o.status}</span>
            </div>
            <p>Seller: {o.seller_name}</p>
            <p>
              {o.quantity} item(s) · {money(o.total)} · {o.payment_method}
            </p>
            <p>Delivery: {o.address}</p>
            <p>
              {Object.entries(o.selected_variants || {})
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ") || "Standard variant"}
            </p>
            <small>
              Order {o.id} · {new Date(o.created_at).toLocaleDateString()} ·
              Payment: {o.payment_status}
            </small>
            <p>
              <Link
                className="btn"
                to={"/listing/" + o.listing_id + "#reviews"}
              >
                Leave a verified review
              </Link>
            </p>
          </section>
        ))
      )}
    </main>
  );
}
export function BuyerSettings({ PasswordInput }) {
  const [profile, setProfile] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const { notify } = useApp(),
    navigate = useNavigate();
  useEffect(() => {
    api("/profile")
      .then(setProfile)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <main className="page">
      <h1>Settings</h1>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {profile && (
        <div className="settings-grid">
          <form
            className="panel"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const d = new FormData(e.currentTarget);
              try {
                setProfile(
                  await api("/profile", {
                    method: "PATCH",
                    body: Object.fromEntries(d),
                  }),
                );
                await refresh();
                window.dispatchEvent(new Event("nearbuy:profile"));
                notify("Profile saved");
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>Your profile</h2>
            <label>
              Name
              <input
                name="name"
                required
                minLength={2}
                maxLength={70}
                defaultValue={profile.name}
              />
            </label>
            <label>
              Mobile number
              <input
                name="phone"
                type="tel"
                pattern="\+94[1-9][0-9]{8}"
                placeholder="+94771234567"
                required
                defaultValue={profile.phone}
              />
              <small>
                Changing your mobile number resets its verification status.
              </small>
            </label>
            <label>
              Delivery address
              <textarea
                name="address"
                required
                minLength={10}
                maxLength={500}
                defaultValue={profile.address}
              />
            </label>
            <button className="btn primary" disabled={busy}>
              Save profile
            </button>
          </form>
          <form
            className="panel"
            onSubmit={async (e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              if (d.get("password") !== d.get("confirm"))
                return setError("Passwords do not match");
              setBusy(true);
              setError("");
              try {
                await api("/profile/password", {
                  method: "POST",
                  body: {
                    current_password: d.get("current_password"),
                    password: d.get("password"),
                  },
                });
                acceptSession(null);
                notify("Password updated. Sign in again.");
                navigate("/login");
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2>Change password</h2>
            <label>
              Current password
              <PasswordInput
                name="current_password"
                autoComplete="current-password"
                required
              />
            </label>
            <label>
              New password
              <PasswordInput
                name="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </label>
            <label>
              Confirm new password
              <PasswordInput
                name="confirm"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            </label>
            <p>
              Use at least 12 characters. Updating your password signs out all
              sessions.
            </p>
            <button className="btn primary" disabled={busy}>
              Update password
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
