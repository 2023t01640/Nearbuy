import React, { useEffect, useRef, useState } from "react";
import { money } from "./data";
export function FeePreview({ price, quantity = 1 }) {
  const gross = Math.round((Number(price) || 0) * 100) * quantity,
    fee = Math.round(gross * 0.07);
  return (
    <div className="notice fee-preview">
      <span>
        Platform fee (7%): <b>{money(fee / 100)}</b>
      </span>
      <br />
      <span>
        Net payout: <b>{money((gross - fee) / 100)}</b>
      </span>
    </div>
  );
}
export function ProductOptions({ product, selection, onChange }) {
  return (
    <section className="panel product-options">
      <p>
        <b>{product.stock_quantity} available</b>
      </p>
      <label>
        Quantity
        <input
          type="number"
          min="1"
          max={Math.min(product.stock_quantity, 99)}
          value={selection.quantity}
          disabled={!product.stock_quantity}
          onChange={(e) =>
            onChange({ ...selection, quantity: Number(e.target.value) })
          }
        />
      </label>
      {Object.entries(product.variants || {}).map(([name, options]) => (
        <label key={name}>
          {name}
          <select
            value={selection.selected_variants[name] || ""}
            onChange={(e) =>
              onChange({
                ...selection,
                selected_variants: {
                  ...selection.selected_variants,
                  [name]: e.target.value,
                },
              })
            }
          >
            <option value="">Select {name}</option>
            {options.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
      ))}
    </section>
  );
}
export function validSelection(product, selection) {
  return (
    selection.quantity >= 1 &&
    Number.isInteger(selection.quantity) &&
    selection.quantity <= Math.min(product.stock_quantity, 99) &&
    Object.entries(product.variants || {}).every(([name, options]) =>
      options.includes(selection.selected_variants[name]),
    )
  );
}
export function CardFields() {
  const [name, setName] = useState(""),
    [number, setNumber] = useState(""),
    [expiry, setExpiry] = useState(""),
    [cvv, setCvv] = useState("");
  const numberRef = useRef(),
    expiryRef = useRef();
  useEffect(() => {
    numberRef.current?.setCustomValidity(
      number.replace(/\s/g, "") === "4242424242424242"
        ? ""
        : "Use the test card 4242 4242 4242 4242. Real cards are not accepted.",
    );
    const match = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(expiry);
    const valid =
      match &&
      new Date(2000 + Number(match[2]), Number(match[1]), 1) > new Date();
    expiryRef.current?.setCustomValidity(
      valid ? "" : "Enter a future expiry in MM/YY format.",
    );
  }, [number, expiry]);
  return (
    <fieldset className="agreement">
      <legend>Online card payment — local simulation</legend>
      <p>
        Use test details only. Card: 4242 4242 4242 4242, any future expiry and
        a 3-digit test CVV. No money is charged; card data stays in this form
        and is never sent to the server.
      </p>
      <label>
        Cardholder Name
        <input
          autoComplete="off"
          required
          minLength={2}
          maxLength={70}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        Card Number
        <input
          ref={numberRef}
          autoComplete="off"
          inputMode="numeric"
          maxLength={23}
          required
          value={number}
          onChange={(e) => setNumber(e.target.value.replace(/[^\d ]/g, ""))}
          placeholder="4242 4242 4242 4242"
        />
      </label>
      <div className="form-row">
        <label>
          Expiry MM/YY
          <input
            ref={expiryRef}
            autoComplete="off"
            inputMode="numeric"
            required
            maxLength={5}
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            placeholder="MM/YY"
          />
        </label>
        <label>
          CVV
          <input
            autoComplete="off"
            inputMode="numeric"
            required
            pattern="[0-9]{3}"
            maxLength={3}
            value={cvv}
            onChange={(e) => setCvv(e.target.value.replace(/\D/g, ""))}
          />
        </label>
      </div>
    </fieldset>
  );
}
