CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, name text NOT NULL, email text UNIQUE NOT NULL, password_hash text NOT NULL,
 role text NOT NULL CHECK(role IN ('buyer','seller','admin')), status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
 verification_status text NOT NULL DEFAULT 'unverified' CHECK(verification_status IN ('unverified','pending','verified','rejected')),
 identity_type text, identity_encrypted text, phone_encrypted text, phone_verified boolean NOT NULL DEFAULT false,
 verification_note text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS session_families (id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),revoked boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS refresh_tokens (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), token_hash text UNIQUE NOT NULL, family uuid NOT NULL REFERENCES session_families(id), expires_at timestamptz NOT NULL, revoked boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS phone_codes (user_id uuid PRIMARY KEY REFERENCES users(id), code_hash text NOT NULL, expires_at timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS categories (id serial PRIMARY KEY, name text UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS listings (
 id uuid PRIMARY KEY, seller_id uuid NOT NULL REFERENCES users(id), category_id integer NOT NULL REFERENCES categories(id), title text NOT NULL, description text NOT NULL,
 price numeric(12,2) NOT NULL CHECK(price>0), location text NOT NULL, condition text NOT NULL CHECK(condition IN ('New','Like new','Good','Fair')),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','sold','removed')), images jsonb NOT NULL DEFAULT '[]', flagged boolean NOT NULL DEFAULT false, flag_reason text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), sold_at timestamptz
);
CREATE TABLE IF NOT EXISTS messages (id uuid PRIMARY KEY, listing_id uuid NOT NULL REFERENCES listings(id), buyer_id uuid NOT NULL REFERENCES users(id), sender_id uuid NOT NULL REFERENCES users(id), body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS reviews (id uuid PRIMARY KEY, listing_id uuid NOT NULL REFERENCES listings(id), buyer_id uuid NOT NULL REFERENCES users(id), rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5), body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(listing_id,buyer_id));
CREATE TABLE IF NOT EXISTS uploads (path text PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS audit_logs (id uuid PRIMARY KEY, actor_id uuid REFERENCES users(id), action text NOT NULL, target text, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS listings_discovery ON listings(status,category_id,created_at);
CREATE INDEX IF NOT EXISTS messages_thread ON messages(listing_id,buyer_id,created_at);
CREATE INDEX IF NOT EXISTS audit_time ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS refresh_user ON refresh_tokens(user_id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS specs jsonb NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS registration_codes (
  id text PRIMARY KEY, email text NOT NULL, phone_encrypted text NOT NULL,
  phone_hash text NOT NULL, code_hash text NOT NULL, expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0, verified boolean NOT NULL DEFAULT false
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS nic_photo_encrypted text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS br_number_encrypted text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS br_photo_encrypted text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS address_encrypted text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS product_category text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS seller_terms_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS legal_agreement_at timestamptz;

ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_status_check;
ALTER TABLE listings ADD CONSTRAINT listings_status_check CHECK(status IN ('draft','active','approved','pending_admin','sold','removed'));
ALTER TABLE listings ALTER COLUMN category_id DROP NOT NULL;
ALTER TABLE listings ALTER COLUMN price DROP NOT NULL;
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_condition_check;
ALTER TABLE listings ADD CONSTRAINT listings_condition_check CHECK(condition IN ('','New','Like new','Good','Fair'));
ALTER TABLE listings ADD COLUMN IF NOT EXISTS size_weight text NOT NULL DEFAULT '';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS payment_methods jsonb NOT NULL DEFAULT '[]';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS approval_note text;
UPDATE listings SET status='approved',payment_methods='["Cash on Delivery"]' WHERE status='active';
CREATE TABLE IF NOT EXISTS orders (
 id uuid PRIMARY KEY,listing_id uuid NOT NULL REFERENCES listings(id),buyer_id uuid NOT NULL REFERENCES users(id),
 seller_id uuid NOT NULL REFERENCES users(id),product_name text NOT NULL,total numeric(12,2) NOT NULL CHECK(total>0),
 address_encrypted text NOT NULL,payment_method text NOT NULL CHECK(payment_method IN ('Cash on Delivery','Online Payment')),
 status text NOT NULL DEFAULT 'placed',payment_status text NOT NULL DEFAULT 'unpaid',created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(listing_id,buyer_id)
);
CREATE INDEX IF NOT EXISTS orders_buyer_listing ON orders(buyer_id,listing_id);

ALTER TABLE orders ALTER COLUMN total TYPE numeric(14,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1 CHECK(quantity BETWEEN 1 AND 99);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS unit_price numeric(12,2);
UPDATE orders SET unit_price=total/quantity WHERE unit_price IS NULL;
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'Pending';
UPDATE orders SET status='Pending' WHERE status='placed';
CREATE TABLE IF NOT EXISTS cart_items(buyer_id uuid REFERENCES users(id),listing_id uuid REFERENCES listings(id),quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 99),created_at timestamptz DEFAULT now(),PRIMARY KEY(buyer_id,listing_id));

ALTER TABLE listings ADD COLUMN IF NOT EXISTS district text;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS stock_quantity integer NOT NULL DEFAULT 1 CHECK(stock_quantity>=0 AND stock_quantity<=1000000);
ALTER TABLE listings ADD COLUMN IF NOT EXISTS variants jsonb NOT NULL DEFAULT '{}';
ALTER TABLE cart_items ADD COLUMN IF NOT EXISTS selected_variants jsonb NOT NULL DEFAULT '{}';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS selected_variants jsonb NOT NULL DEFAULT '{}';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS platform_fee numeric(14,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS net_payout numeric(14,2);
UPDATE orders SET platform_fee=round(total*0.07,2),net_payout=total-round(total*0.07,2) WHERE platform_fee IS NULL;
