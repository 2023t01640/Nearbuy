import { districts } from "./Registration";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  MapPin,
  ArrowUpRight,
  ArrowRight,
  Heart,
  SlidersHorizontal,
  ShieldCheck,
  Leaf,
  MessageCircle,
  Star,
  LayoutGrid,
  Car,
  Building2,
  Wrench,
  PawPrint,
  Sprout,
  Utensils,
  Package,
  Armchair,
  Smartphone,
  Shirt,
  Dumbbell,
  BookOpen,
} from "lucide-react";
import { useApp } from "./context";
import { money } from "./data";
const normalizeCategory = (category) =>
  String(category ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ");

// Categories come from the API in alphabetical order, so icons follow names,
// never array positions. Unknown/admin-created categories use a neutral grid.
const categoryIcons = new Map(
  [
    [Smartphone, ["electronics", "electric items", "electrical items"]],
    [Armchair, ["furniture", "home and living", "home living"]],
    [Car, ["vehicles", "vehicle", "motors", "cars"]],
    [Building2, ["property", "real estate", "properties"]],
    [Shirt, ["fashion", "clothing", "clothes"]],
    [BookOpen, ["books and hobbies", "books hobbies", "books", "education"]],
    [Dumbbell, ["sports", "fitness"]],
    [Wrench, ["services", "tools"]],
    [PawPrint, ["pets"]],
    [Sprout, ["agriculture", "pets and agriculture", "pets agriculture"]],
    [Utensils, ["food", "groceries", "food and groceries", "food groceries"]],
    [LayoutGrid, ["all", "all items", "all categories"]],
    [Package, ["other", "others"]],
  ].flatMap(([icon, names]) =>
    names.map((name) => [normalizeCategory(name), icon]),
  ),
);
const categoryIcon = (category) =>
  categoryIcons.get(normalizeCategory(category)) || LayoutGrid;

export function Home() {
  const { listings, saved, categories } = useApp();
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("All items"),
    [location, setLocation] = useState("All Sri Lanka"),
    [sort, setSort] = useState("Newest first"),
    [onlySaved, setOnlySaved] = useState(false);
  const items = listings
    .filter(
      (p) =>
        p.status === "approved" &&
        (!onlySaved || saved.includes(p.id)) &&
        (category === "All items" || p.category === category) &&
        (location === "All Sri Lanka" || p.district === location) &&
        (p.title + " " + p.description + " " + p.location)
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "Price: low to high"
        ? a.price - b.price
        : sort === "Price: high to low"
          ? b.price - a.price
          : new Date(b.createdAt) - new Date(a.createdAt),
    );
  return (
    <main className="home">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span /> YOUR NEIGHBOURHOOD MARKETPLACE
          </span>
          <h1>
            Good finds.
            <br />
            Closer to <em>home.</em>
          </h1>
          <p>
            Discover pre-loved gems, meet local sellers, and give
            <br className="desktop" /> great things a new beginning.
          </p>
          <a className="hero-link" href="#finds">
            Find your next favourite <ArrowUpRight size={18} />
          </a>
          <div className="hero-proof">
            <span className="avatar-stack">
              <b>NP</b>
              <b>AS</b>
              <b>KF</b>
            </span>
            <span>
              Small finds. Real connections.
              <br />
              <strong>From your local community.</strong>
            </span>
          </div>
        </div>
        <div className="hero-art">
          <div className="arch">
            <img
              src="https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?auto=format&fit=crop&w=850&q=85"
              alt="A cosy chair in a sunlit home"
            />
          </div>
          <div className="floating-tag">
            <span>✦</span>
            <div>
              A second life.
              <br />
              <b>A new favourite.</b>
            </div>
          </div>
          <div className="local-tag">
            <MapPin size={15} /> Somewhere near you
          </div>
          <span className="art-caption">LESS NEW. MORE YOU.</span>
        </div>
      </section>
      <section className="search-panel" aria-label="Find listings">
        <Search size={22} />
        <input
          aria-label="Search items"
          placeholder="What are you looking for?"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="location-select">
          <MapPin size={18} />
          <select
            aria-label="Filter by location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          >
            <option>All Sri Lanka</option>
            {districts.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </div>
        <a className="btn primary" href="#finds">
          Explore finds <ArrowRight size={16} />
        </a>
      </section>
      <section className="category-section">
        <div className="section-title">
          <h2>Find your kind of thing</h2>
          <span>A little bit of everything, nearby.</span>
        </div>
        <div className="categories">
          {categories.map((c) => {
            const Icon = categoryIcon(c);
            return (
              <button
                key={c}
                className={category === c ? "category active" : "category"}
                onClick={() => setCategory(c)}
              >
                <Icon size={23} />
                <span>{c}</span>
              </button>
            );
          })}
        </div>
      </section>
      <section id="finds">
        <div className="section-title finds-title">
          <div>
            <span className="eyebrow">THE LOCAL EDIT</span>
            <h2>
              {onlySaved ? "Your saved finds" : "Fresh finds near you"}{" "}
              <span className="count">{items.length}</span>
            </h2>
            <p>Someone’s once-loved. Your next favourite.</p>
          </div>
          <div className="sort-controls">
            <button
              className={"btn subtle " + (onlySaved ? "selected" : "")}
              onClick={() => setOnlySaved(!onlySaved)}
            >
              <Heart size={16} /> Saved {saved.length > 0 && saved.length}
            </button>
            <SlidersHorizontal size={17} />
            <select
              aria-label="Sort listings"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option>Newest first</option>
              <option>Price: low to high</option>
              <option>Price: high to low</option>
            </select>
          </div>
        </div>
        <div className="product-grid">
          {items.map((p) => (
            <Card key={p.id} p={p} />
          ))}
        </div>
        {!items.length && (
          <div className="empty">
            <Search />
            <h3>No finds just yet</h3>
            <p>Try another keyword or widen your location.</p>
            <button
              className="btn"
              onClick={() => {
                setQuery("");
                setCategory("All items");
                setLocation("All Sri Lanka");
                setOnlySaved(false);
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </section>
      <section className="values">
        <div>
          <ShieldCheck />
          <span>
            <b>People, not storefronts</b>
            <small>Connect directly with local sellers.</small>
          </span>
        </div>
        <div>
          <Leaf />
          <span>
            <b>Good for your pocket. And the planet.</b>
            <small>Give something great another chapter.</small>
          </span>
        </div>
        <div>
          <MessageCircle />
          <span>
            <b>A conversation away</b>
            <small>Ask a question. Make a connection.</small>
          </span>
        </div>
      </section>
    </main>
  );
}
export function ProductImage({ src, alt, ...props }) {
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={(e) => {
        e.currentTarget.onerror = null;
        e.currentTarget.src = "/placeholder.svg";
      }}
      {...props}
    />
  );
}
function Card({ p }) {
  const { saved, setSaved } = useApp();
  const liked = saved.includes(p.id);
  return (
    <article className="product-card">
      <div className="product-image">
        <Link to={"/listing/" + p.id}>
          <ProductImage src={p.images[0]} alt={p.title} />
        </Link>
        <span className="condition">{p.condition}</span>
        <button
          aria-label={(liked ? "Unsave " : "Save ") + p.title}
          className={"save-btn " + (liked ? "liked" : "")}
          onClick={() =>
            setSaved((prev) =>
              liked ? prev.filter((id) => id !== p.id) : [...prev, p.id],
            )
          }
        >
          <Heart size={18} fill={liked ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="card-meta">
        <span>{p.category}</span>
        <span>{new Date(p.createdAt).toLocaleDateString()}</span>
      </div>
      <Link className="card-title" to={"/listing/" + p.id}>
        {p.title}
      </Link>
      <strong className="price">{money(p.price)}</strong>
      <div className="card-bottom">
        <span>
          <MapPin size={13} />
          {p.location}
        </span>
        <span>
          <span
            className={
              "badge " +
              (p.verification_status === "verified" ? "green" : "amber")
            }
          >
            {p.verification_status === "verified"
              ? "✓ Verified Seller"
              : p.verification_status === "pending"
                ? "Pending Verification"
                : "Unverified Seller"}
          </span>
        </span>
      </div>
    </article>
  );
}
