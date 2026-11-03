"use client";

import { HeroDemo } from "./HeroDemo";

type Props = { onPlay: () => void; onPrologue: () => void };

const STEPS = [
  {
    n: 1,
    title: "Loot Reality",
    body: "Pick any photo and tap an object. Sam — the Meta SAM 3.1 model — cuts out its exact pixels.",
    icon: "✂",
  },
  {
    n: 2,
    title: "Break the Sketch",
    body: "Drop the real cut-out into the pencil museum to block cameras, bridge gaps, weigh down plates and hang on hooks.",
    icon: "✎",
  },
  {
    n: 3,
    title: "Escape the Museum",
    body: "Only the shape counts — length, thickness, holes. Get it right and run for the diamond.",
    icon: "◆",
  },
];

export function Landing({ onPlay, onPrologue }: Props) {
  return (
    <div className="landing">
      <nav className="landing-nav" aria-label="Main">
        <a href="#home" className="logo">PIXEL HEIST</a>
        <ul>
          <li><a href="#home">Home</a></li>
          <li><a href="#story">Story</a></li>
          <li><a href="#how">How It Works</a></li>
          <li><a href="#media">Media</a></li>
        </ul>
      </nav>

      <section id="home" className="hero">
        <div className="hero-copy">
          <h1 className="logo logo-big">PIXEL HEIST</h1>
          <p className="hero-tagline">Steal reality.<br />Escape the sketch.</p>
          <p className="hero-sub">A heist puzzle where your loot is cut out of real photos by Meta SAM 3.1 — and its true shape is the only key.</p>
          <div className="title-actions">
            <button className="btn btn-primary btn-big" onClick={onPlay}>▶ Play the Heist</button>
            <button className="btn" onClick={onPrologue}>Watch Prologue</button>
          </div>
        </div>
        <div className="hero-art">
          <HeroDemo />
        </div>
      </section>

      <section id="how" className="steps" aria-label="How it works">
        {STEPS.map((s) => (
          <article key={s.n} className="step-card">
            <span className="step-icon" aria-hidden>{s.icon}</span>
            <h2><span className="step-n">{s.n}.</span> {s.title}</h2>
            <p>{s.body}</p>
          </article>
        ))}
      </section>

      <section id="story" className="story">
        <h2 className="section-title">The Story</h2>
        <p>
          The Sketch Museum is drawn entirely in pencil: its cameras, its lasers, its locked doors, even the diamond.
          Pencil can&apos;t stop something real. So you call Sam — an AI cut-out specialist, the Meta SAM 3.1 model — and smuggle in pieces of real photos.
        </p>
        <p>
          Ten rooms. Each one asks for a different shape. A mug&apos;s handle has a real hole; a ruler is long and thin; a calculator is chunky.
          Sam&apos;s masks keep those differences. A bounding box would erase them.
        </p>
        <button className="btn" onClick={onPrologue}>Watch the prologue ▸</button>
      </section>

      <section id="media" className="media">
        <h2 className="section-title">Media</h2>
        <div className="media-grid">
          <figure className="media-card">
            <div className="media-video">Demo video — coming soon</div>
            <figcaption>3-minute walkthrough: live SAM cuts, mask vs box X-ray, the run to the vault.</figcaption>
          </figure>
          <div className="media-card media-facts">
            <h3>Under the hood</h3>
            <ul>
              <li>Meta SAM 3.1 via the Meta API, one point prompt per object</li>
              <li>Collisions use the real mask, never the object&apos;s name</li>
              <li>X-ray mode replays your plan with bounding boxes — and it fails</li>
              <li>Two sample desks with different solutions; or bring your own photo</li>
            </ul>
          </div>
        </div>
      </section>

      <footer className="landing-foot">
        <span className="muted">PIXEL HEIST · Meta Global AI Developer Hackathon 2026 · Sample desk photos are AI-generated.</span>
      </footer>
    </div>
  );
}
