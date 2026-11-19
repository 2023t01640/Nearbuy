import { CardFields, validSelection } from "./ProductOptions";
import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { X, MoreVertical } from "lucide-react";
import { api } from "./api";
import { useApp } from "./context";
import { money } from "./data";
function Modal({ title, onClose, children }) {
  const ref = useRef();
  useEffect(() => {
    ref.current.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal panel commerce-dialog"
      onCancel={onClose}
      aria-label={title}
    >
      <div className="section-title">
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-btn"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function BuyNow({ product, selection, onOrder }) {
  const { session } = useApp();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [order, setOrder] = useState(null);
  const methods = product.payment_methods || [];
  const [method, setMethod] = useState(methods[0] || "");
  return (
    <>
      <button
        className="btn primary full buy-now"
        disabled={
          product.status !== "approved" ||
          !product.price ||
          !methods.length ||
          product.can_review ||
          !validSelection(product, selection)
        }
        onClick={() => {
          setOpen(true);
          setError("");
        }}
      >
        {product.can_review
          ? "Order placed"
          : product.stock_quantity === 0
            ? "Out of stock"
            : "Buy Now"}
      </button>
      {(!product.price || !methods.length) && (
        <small>
          Checkout is available once the seller supplies a price and payment
          method.
        </small>
      )}
      {open && (
        <Modal
          title={order ? "Order placed" : "Checkout"}
          onClose={() => setOpen(false)}
        >
          {order ? (
            <div role="status">
              <h3>Thank you! Your order is recorded.</h3>
              <p>Order reference: {order.id}</p>
              <p>
                {order.product_name} — {money(order.total)}
              </p>
              <p>{order.payment_method} · Payment not collected</p>
              <p>
                Message the seller to arrange delivery and payment. You can now
                leave a review.
              </p>
              <button className="btn primary" onClick={() => setOpen(false)}>
                Done
              </button>
            </div>
          ) : session?.role !== "buyer" ? (
            <p>
              <Link to="/login">Log in as a buyer</Link> to place an order.
            </p>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                const d = new FormData(e.currentTarget);
                try {
                  const result = await api(`/listings/${product.id}/orders`, {
                    method: "POST",
                    body: {
                      address: d.get("address"),
                      payment_method: d.get("payment_method"),
                      quantity: selection.quantity,
                      selected_variants: selection.selected_variants,
                      card_simulation: method === "Online Payment",
                    },
                  });
                  setOrder(result);
                  onOrder();
                } catch (e) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="order-summary">
                <b>{product.title}</b>
                <p>Seller: {product.seller}</p>
                <p>Quantity: {selection.quantity}</p>
                <p>
                  {Object.entries(selection.selected_variants)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ")}
                </p>
                <strong>{money(product.price * selection.quantity)}</strong>
              </div>
              <label>
                Delivery address
                <textarea
                  name="address"
                  autoComplete="street-address"
                  minLength={10}
                  maxLength={500}
                  required
                  placeholder="House number, street, city and district"
                />
              </label>
              <fieldset className="agreement">
                <legend>Payment method</legend>
                {methods.map((methodOption, i) => (
                  <label className="legal-agreement" key={methodOption}>
                    <input
                      type="radio"
                      name="payment_method"
                      value={methodOption}
                      checked={method === methodOption}
                      onChange={() => setMethod(methodOption)}
                      required
                    />
                    {methodOption}
                  </label>
                ))}
              </fieldset>
              {method === "Online Payment" && <CardFields />}
              <label className="legal-agreement">
                <input type="checkbox" required />I confirm this delivery
                address and order summary are correct.
              </label>
              <p className="muted">
                No payment is collected here. For Online Payment, arrange
                payment with the seller after confirming the item. Delivery
                charges, if any, must be agreed with the seller.
              </p>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <button className="btn primary full" disabled={busy}>
                {busy ? "Placing order..." : "Place order"}
              </button>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
export function ProductMenu({ product }) {
  const { session, notify } = useApp();
  const [modal, setModal] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const menu = useRef();
  function choose(value) {
    menu.current.open = false;
    setError("");
    setModal(value);
  }
  return (
    <>
      <details className="product-menu" ref={menu}>
        <summary aria-label="Product options">
          <MoreVertical size={22} />
        </summary>
        <div className="panel product-menu-options">
          <button
            type="button"
            onClick={async () => {
              menu.current.open = false;
              try {
                await navigator.clipboard.writeText(
                  `${window.location.origin}/listing/${product.id}`,
                );
                notify("Link copied!");
              } catch {
                choose("Share");
              }
            }}
          >
            Share
          </button>
          <button type="button" onClick={() => choose("Report")}>
            Report
          </button>
          <button type="button" onClick={() => choose("Help")}>
            Help
          </button>
        </div>
      </details>
      {modal && (
        <Modal
          title={
            modal === "Report"
              ? "Report this listing"
              : modal === "Help"
                ? "Buyer safety & support"
                : "Share this listing"
          }
          onClose={() => setModal(null)}
        >
          {modal === "Share" ? (
            <label>
              Copy this link
              <input
                readOnly
                value={`${window.location.origin}/listing/${product.id}`}
                onFocus={(e) => e.target.select()}
              />
            </label>
          ) : modal === "Help" ? (
            <>
              <p>
                Keep conversations on NearBuy. Inspect the item before paying
                and meet in a safe public place.
              </p>
              <p>
                Never share OTPs, passwords or card details in chat. A Verified
                Seller badge confirms identity review, not product quality.
              </p>
              <p>
                For suspicious listings, use Report. Admins review reports in
                their moderation queue. For order or delivery questions, message
                the seller below.
              </p>
            </>
          ) : !session ? (
            <p>
              <Link to="/login">Log in</Link> to submit a report.
            </p>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  await api(`/listings/${product.id}/flag`, {
                    method: "POST",
                    body: {
                      reason: new FormData(e.currentTarget).get("reason"),
                    },
                  });
                  setModal(null);
                  notify("Report submitted");
                } catch (e) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                What is the concern?
                <textarea
                  name="reason"
                  minLength={5}
                  maxLength={300}
                  required
                  placeholder="Describe the issue for our moderators"
                />
              </label>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button className="btn primary" disabled={busy}>
                {busy ? "Submitting..." : "Submit report"}
              </button>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
