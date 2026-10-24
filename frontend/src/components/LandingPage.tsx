import React from 'react';
import { ArrowRight, CheckCircle2, Gauge, Layers3, ShieldCheck, Workflow } from 'lucide-react';

type LandingPageProps = { onOpenDashboard: () => void };

const features = [
  { icon: Gauge, title: 'See the whole system', text: 'Track jobs, queues, nodes, and resource pressure from one calm command surface.' },
  { icon: ShieldCheck, title: 'Understand every decision', text: 'Follow safe-state checks, denials, and allocation events as they happen.' },
  { icon: Layers3, title: 'Replay and compare', text: 'Explore scenarios, compare policies, and find the path to a healthier cluster.' },
];

export function LandingPage({ onOpenDashboard }: LandingPageProps) {
  return (
    <main className="landing-page">
      <header className="landing-nav">
        <div className="brand">
          <span className="brand-mark"><Workflow /></span>
          <span>labqueue</span>
          <span className="brand-dot" />
        </div>
        <span className="landing-nav-note">Compute orchestration, made legible.</span>
      </header>

      <section className="landing-hero">
        <div className="landing-copy">
          <div className="eyebrow"><span className="pulse" /> Control plane · ready</div>
          <h1>Make complex compute feel <em>clear.</em></h1>
          <p>LabQueue gives your team a live, readable view of every job, resource, and scheduling decision across the cluster.</p>
          <button className="landing-cta" onClick={onOpenDashboard}>
            Open mission control <ArrowRight data-icon="inline-end" />
          </button>
          <div className="landing-proof">
            <CheckCircle2 /> <span>Replay simulations or connect to your live OS</span>
          </div>
        </div>
        <div className="hero-orbit" aria-label="Abstract illustration of a connected compute cluster">
          <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <div className="orbit-core"><Workflow /></div>
          <span className="orbit-node node-a">job-118</span>
          <span className="orbit-node node-b">GPU · 72%</span>
          <span className="orbit-node node-c">SAFE</span>
        </div>
      </section>

      <section className="landing-features" aria-label="LabQueue features">
        {features.map(({ icon: Icon, title, text }) => (
          <article className="landing-feature" key={title}>
            <div className="feature-icon"><Icon /></div>
            <h2>{title}</h2>
            <p>{text}</p>
          </article>
        ))}
      </section>

      <section className="landing-callout">
        <span className="section-kicker">A better operating picture</span>
        <h2>Less hunting through logs.<br /><span>More confident decisions.</span></h2>
        <p>Move from a noisy stream of events to a shared understanding of what your system is doing and why.</p>
      </section>

      <footer className="landing-footer">
        <span>LabQueue OS · v0.8.4</span>
        <span>Real-time discrete-event simulation</span>
      </footer>
    </main>
  );
}
