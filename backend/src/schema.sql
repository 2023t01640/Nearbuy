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
