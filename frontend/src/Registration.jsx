import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { api, acceptSession } from "./api";
import { useApp } from "./context";
export const districts = [
  "Colombo",
  "Gampaha",
  "Kalutara",
  "Kandy",
  "Matale",
  "Nuwara Eliya",
  "Galle",
  "Matara",
  "Hambantota",
  "Jaffna",
  "Kilinochchi",
  "Mannar",
  "Vavuniya",
  "Mullaitivu",
  "Batticaloa",
  "Ampara",
  "Trincomalee",
  "Kurunegala",
  "Puttalam",
  "Anuradhapura",
  "Polonnaruwa",
  "Badulla",
  "Monaragala",
  "Ratnapura",
  "Kegalle",
];
function ProviderLogo({ provider }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      {provider === "google" ? (
        <>
          <path
            fill="#4285F4"
            d="M21.8 12.2c0-.7-.1-1.5-.2-2.2H12v4h5.5a4.7 4.7 0 0 1-2 3.1v2.6h3.3c1.9-1.8 3-4.3 3-7.5Z"
          />
          <path
            fill="#34A853"
            d="M12 22c2.7 0 5-.9 6.8-2.4l-3.3-2.6c-.9.6-2.1.9-3.5.9-2.6 0-4.8-1.7-5.6-4H3v2.7A10.2 10.2 0 0 0 12 22Z"
          />
          <path
            fill="#FBBC05"
            d="M6.4 14a6 6 0 0 1 0-4V7.3H3a10 10 0 0 0 0 9.4L6.4 14Z"
          />
          <path
            fill="#EA4335"
            d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.9-2.9A9.8 9.8 0 0 0 12 2a10.2 10.2 0 0 0-9 5.3L6.4 10c.8-2.3 3-3.9 5.6-3.9Z"
          />
        </>
      ) : provider === "facebook" ? (
        <>
          <circle cx="12" cy="12" r="10" fill="#1877F2" />
          <path
            fill="white"
            d="M13.5 22v-9h3l.5-3h-3.5V8.5c0-.9.3-1.5 1.7-1.5H17V4.2c-.5-.1-1.6-.2-2.7-.2-2.8 0-4.3 1.7-4.3 4.6V10H7v3h3v9Z"
          />
        </>
      ) : (
        <path
          fill="currentColor"
          d="M16.8 12.6c0-2 1.6-3 1.7-3.1-1-1.5-2.5-1.7-3.1-1.7-1.3-.2-2.5.8-3.2.8-.7 0-1.8-.8-2.9-.8-1.5 0-2.8.9-3.6 2.2-1.5 2.7-.4 6.8 1.1 9 .8 1 1.6 2.2 2.7 2.1 1.1 0 1.5-.7 2.9-.7 1.3 0 1.7.7 2.9.7 1.2 0 2-1.1 2.7-2.1.9-1.2 1.2-2.4 1.2-2.4-.1 0-2.4-.9-2.4-4ZM14.7 6.4c.6-.8 1.1-1.8 1-2.9-1 .1-2.1.7-2.8 1.4-.6.7-1.2 1.8-1 2.8 1 .1 2.1-.5 2.8-1.3Z"
        />
      )}
    </svg>
  );
}
export default function Registration({ PasswordInput }) {
  const { categoryRows, notify } = useApp(),
    navigate = useNavigate();
  const [role, setRole] = useState("buyer"),
    [email, setEmail] = useState(""),
    [phone, setPhone] = useState(""),
    [terms, setTerms] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [otp, setOtp] = useState(null),
    [code, setCode] = useState(""),
    [verified, setVerified] = useState(false);
  useEffect(() => {
    if (!otp?.challengeId) return;
    const timer = setTimeout(() => {
      setOtp(null);
      setVerified(false);
      setCode("");
      setError("Phone verification expired. Please request a new code.");
    }, 600000);
    return () => clearTimeout(timer);
  }, [otp?.challengeId]);
  function resetPhone() {
    setOtp(null);
    setVerified(false);
    setCode("");
  }
  async function action(fn) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function sendOtp() {
    action(async () => {
      const result = await api("/auth/registration-otp", {
        method: "POST",
        body: { email, phone },
      });
      setOtp(result);
      setVerified(false);
      setCode("");
    });
  }
  async function submit(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (form.get("password") !== form.get("confirm"))
      return setError("Passwords do not match");
    form.delete("confirm");
    form.set("role", role);
    if (role === "buyer") form.set("challengeId", otp?.challengeId || "");
    await action(async () => {
      await api("/auth/register", { method: "POST", body: form });
      notify("Account created. Sign in to continue.");
      navigate("/login");
    });
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
        <h2>Join the neighbourhood</h2>
        <p>Create your NearBuy account.</p>
        <div className="role-switch" role="tablist" aria-label="Account type">
          {["buyer", "seller"].map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={role === r}
              aria-controls="registration-panel"
              id={`${r}-tab`}
              className={role === r ? "active" : ""}
              onClick={() => {
                setRole(r);
                setError("");
              }}
            >
              {r === "buyer" ? "Buyer" : "Seller"}
            </button>
          ))}
        </div>
        <form
          id="registration-panel"
          role="tabpanel"
          aria-labelledby={`${role}-tab`}
          onSubmit={submit}
        >
          <label>
            {role === "seller" ? "Name / Business Name" : "Full Name"}
            <input
              name="name"
              autoComplete="name"
              minLength={2}
              maxLength={70}
              required
            />
          </label>
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                resetPhone();
              }}
            />
          </label>
          <label>
            Password
            <PasswordInput
              name="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
            <small>At least 12 characters.</small>
          </label>
          <label>
            Confirm password
            <PasswordInput
              name="confirm"
              visibilityLabel="confirm password"
              autoComplete="new-password"
              required
            />
          </label>
          <label>
            Mobile Number
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="+94771234567"
              pattern="\+94[1-9][0-9]{8}"
              required
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                resetPhone();
              }}
            />
            <small>Use the Sri Lankan +94 format.</small>
          </label>
          {role === "buyer" ? (
            <div className="registration-otp">
              {verified ? (
                <p className="badge green" role="status">
                  Mobile number verified
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn"
                    disabled={
                      busy ||
                      !/^\+94[1-9]\d{8}$/.test(phone) ||
                      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
                    }
                    onClick={sendOtp}
                  >
                    {otp ? "Resend code" : "Send verification code"}
                  </button>
                  {otp && (
                    <>
                      <p role="status">Code sent. Valid for 10 minutes.</p>
                      {otp.devOtp && (
                        <div className="dev-otp-preview" role="status">
                          <strong>Dev Mode OTP Preview</strong>
                          <code>{otp.devOtp}</code>
                          <small>
                            Use this code to verify your mobile number.
                          </small>
                        </div>
                      )}
                      <label>
                        6-digit verification code
                        <input
                          inputMode="numeric"
                          maxLength={6}
                          value={code}
                          onChange={(e) =>
                            setCode(e.target.value.replace(/\D/g, ""))
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="btn"
                        disabled={busy || code.length !== 6}
                        onClick={() =>
                          action(async () => {
                            await api("/auth/confirm-registration-otp", {
                              method: "POST",
                              body: { challengeId: otp.challengeId, code },
                            });
                            setVerified(true);
                            setOtp({ ...otp, devOtp: null });
                          })
                        }
                      >
                        Verify mobile number
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          ) : (
            <>
              <label>
                NIC Number
                <input
                  name="nic_number"
                  pattern="([0-9]{9}[vVxX]|[0-9]{12})"
                  placeholder="200012345678"
                  required
                />
              </label>
              <label>
                NIC Photo
                <input
                  name="nic_photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                />
                <small>
                  JPEG, PNG or WebP, up to 5 MB. Private admin review only.
                </small>
              </label>
              <label>
                Product Category
                <select name="product_category" required defaultValue="">
                  <option value="" disabled>
                    Select a category
                  </option>
                  {[
                    ...new Set([
                      ...(categoryRows || []).map((c) => c.name),
                      "Other",
                    ]),
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Personal / Business Address
                <textarea
                  name="address"
                  autoComplete="street-address"
                  minLength={8}
                  maxLength={300}
                  required
                />
              </label>
              <label>
                Sri Lanka District
                <select name="district" required defaultValue="">
                  <option value="" disabled>
                    Select your district
                  </option>
                  {[...new Set(districts)].map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </label>
              <fieldset className="agreement">
                <legend>Seller Terms &amp; Conditions</legend>
                <p>
                  Provide accurate identity and listing details, sell only
                  lawful goods, and treat buyers respectfully. Identity
                  documents are used for private admin verification. Fraud or
                  prohibited activity may result in removal of listings and
                  suspension of your account.
                </p>
                <div className="agreement-options">
                  {["agree", "disagree"].map((value) => (
                    <label key={value}>
                      <input
                        type="radio"
                        name="seller_terms"
                        value={value}
                        checked={terms === value}
                        onChange={() => setTerms(value)}
                        required
                      />
                      {value === "agree" ? "Agree" : "Disagree"}
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            className="btn primary full"
            disabled={
              busy || (role === "seller" ? terms !== "agree" : !verified)
            }
          >
            {busy ? "Please wait..." : "Create account"}{" "}
            <ArrowRight size={16} />
          </button>
        </form>
        {role === "buyer" && (
          <div className="oauth-options">
            <p className="muted">Or continue with a provider</p>
            {["google", "facebook", "apple"].map((provider) => (
              <button
                key={provider}
                type="button"
                className="btn full oauth-button"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    const data = await api("/auth/mock-oauth", {
                      method: "POST",
                      body: { provider },
                    });
                    acceptSession(data);
                    navigate("/");
                    notify("Signed in to a local mock buyer account.");
                  })
                }
              >
                <ProviderLogo provider={provider} />
                Continue with {provider[0].toUpperCase() + provider.slice(1)}
              </button>
            ))}
            <small>
              Local demo OAuth: uses a separate mock buyer account; no provider
              credentials are requested. Disabled in production.
            </small>
          </div>
        )}
        <p className="auth-foot">
          <Link to="/login">Already registered? Log in</Link>
        </p>
        {role === "seller" && (
          <div className="notice">
            After signing in, submit your BR details and verify your phone in
            the seller dashboard to request a Verified Seller badge.
          </div>
        )}
      </section>
    </main>
  );
}
