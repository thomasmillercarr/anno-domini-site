/**
 * Single source of truth for all site content.
 *
 * Everything here is currently PLACEHOLDER copy carried over from the Claude
 * Design wireframe. To launch with real content, edit this file only — every
 * component reads from `site`, so nothing is hard-coded in markup.
 */

export interface NavLink {
  label: string;
  href: string;
}

export interface Principle {
  /** Inline SVG markup for the icon (stroke inherits currentColor). */
  icon: string;
  text: string;
}

export interface Step {
  num: string;
  label: string;
  body: string;
}

export interface Rung {
  label: string;
  desc: string;
  tag: string;
  active?: boolean;
}

export interface ProofImage {
  src: string;
  alt: string;
}

export interface ProofBar {
  title: string;
  note: string;
}

/* ---- icon markup (kept verbatim from the wireframe) ---- */
const ICONS = {
  bolt:
    '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 5 13h4l-3 5h12l-3-5h4L12 3z"></path><path d="M12 18v3"></path></svg>',
  target:
    '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5"><circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"></circle></svg>',
  origami:
    '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h14L9 12l10 8H5l10-8z"></path></svg>',
  person:
    '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"></circle><path d="M5 21c0-3.9 3.1-7 7-7s7 3.1 7 7"></path></svg>',
} as const;

export const site = {
  /* ---- brand / meta ---- */
  brand: 'Anno Domini',
  brandFull: 'Anno Domini — A Fractional AI Partner',
  // Wordmark logo (the "AD" leaf). Monochrome dark artwork on a transparent
  // background — the CSS flips it to light over the hero photo / dark theme.
  logo: '/assets/anno-domini-logo.png',
  logoAlt: 'Anno Domini',
  tagline: 'Anno Domini — Fractional AI Partner, UK',
  description:
    'Anno Domini builds custom AI operating systems inside your business — infrastructure that returns time and decision-making to the people doing the work.',
  email: 'hello@os.partners',
  region: 'United Kingdom',

  /* ---- navigation ---- */
  nav: [
    { label: 'Approach', href: '#approach' },
    { label: 'About', href: '#about' },
    { label: 'Insights', href: '#insights' },
  ] as NavLink[],
  navCta: "Let’s talk",

  /* ---- hero ---- */
  hero: {
    image: '/assets/hero-banner.png',
    imageAlt: 'Light through timber structure',
    sub: 'Anno Domini — Fractional AI Partner, UK',
    // `headlineLead` + emphasised `headlineEm` render as: "… <em>agency.</em>"
    headlineLead: 'Infrastructure that returns ',
    headlineEm: 'agency.',
    cta: 'See how it works',
    ctaHref: '#approach',
    stat: {
      cap: 'Time returned',
      value: '18.2',
      unit: 'hrs',
      note: 'per week, on average',
    },
  },

  /* ---- manifesto ---- */
  manifesto: {
    image: '/assets/manifesto-bg.png',
    imageAlt: 'Raw timber beam in shadow',
    heading: 'Built to return agency.',
    principles: [
      { icon: ICONS.bolt, text: 'We build systems that give time and decision-making back to the people doing the work.' },
      { icon: ICONS.target, text: 'Infrastructure should be invisible — load-bearing, and already part of the building by the time you notice it.' },
      { icon: ICONS.origami, text: 'We live at the intersection of craft and technology — translating between the two, building things that work quietly.' },
      { icon: ICONS.person, text: 'AI should eliminate the work that was never worth doing — so the work that is gets the full weight of human attention.' },
    ] as Principle[],
    foot: 'Precision that feels grown, not engineered.',
  },

  /* ---- problem ---- */
  problem: {
    label: 'The problem',
    // `b` segments render bold inside the statement.
    items: [
      { pre: 'Your team are spending ', b: 'four hours screening leads', post: ' that a system could sort in eight minutes.' },
      { pre: 'Clients chase “any updates?” because your process doesn’t update them automatically.', b: '', post: '' },
      { pre: 'Your pipeline lives in a Friday afternoon spreadsheet nobody finishes before they leave.', b: '', post: '' },
    ],
  },

  /* ---- solution ---- */
  solution: {
    label: 'What we build',
    heading: 'An AI operating system installed inside your business. Built for how you work.',
    body: 'Not a subscription tool. Not a generic automation platform. A custom system built around your desk, your clients, and the way your team operates — then handed over to you.',
    index: ['CV Screening', 'Client Updates', 'Report Generator', 'CRM Integration', 'Pipeline View', 'Query Handling'],
    device: {
      image: '/assets/solution-bg.png',
      imageAlt: 'Timber work surface',
      core: 'System<br>by design',
      caption: 'Manual work in. Owned, documented systems out.',
    },
  },

  /* ---- how it works ---- */
  howItWorks: {
    label: 'How it works',
    lede: 'A repeatable cycle. Each delivery is small, owned, and surfaces the next one.',
    steps: [
      { num: '01', label: 'Brief', body: 'We map your workflows in one session. One clear problem. One measurable output.' },
      { num: '02', label: 'Build', body: 'We ship a working solution in 3–7 days. Modular — every build reuses components.' },
      { num: '03', label: 'Deliver', body: 'You receive a working tool, a walkthrough, and documentation you own completely.' },
      { num: '04', label: 'Repeat', body: 'Every delivery surfaces the next brief. The system grows. The workflow adapts.' },
    ] as Step[],
  },

  /* ---- ladder ---- */
  ladder: {
    label: 'How we work together',
    rungs: [
      { label: 'Session', desc: 'One-on-one. We set up your AI operating system together. You leave with a working system and a clear picture of where automation earns its place.', tag: 'Start here', active: true },
      { label: 'Audit', desc: 'We map your workflows properly. You receive a written diagnosis of your top automation opportunities and one working tool built from it.', tag: '·' },
      { label: 'Project', desc: 'One focused scope. A single workflow automated end to end. Numbers prove the return.', tag: '·' },
      { label: 'Retainer', desc: 'An ongoing operating system — built, maintained, and expanded as your business grows.', tag: '·' },
    ] as Rung[],
  },

  /* ---- proof ---- */
  proof: {
    label: 'Proof',
    statement: 'Already running inside a real business.',
    body: 'Every tool in this system was built and deployed inside a live operation — before a single external client was taken on. CV screening. Lead generation. Client communication. Pipeline reporting. Built, tested, and running.',
    images: [
      { src: '/assets/proof-1-email.png', alt: 'Email lead generation system' },
      { src: '/assets/proof-2-newsletter.png', alt: 'Newsletter infrastructure' },
      { src: '/assets/proof-3-pipeline.png', alt: 'Pipeline reporting view' },
    ] as ProofImage[],
    bars: [
      { title: 'Email lead generation', note: 'Running daily' },
      { title: 'Newsletter infrastructure', note: 'Rebuilt from scratch' },
      { title: 'Pipeline reporting', note: 'Deployed and in use' },
    ] as ProofBar[],
  },

  /* ---- cta ---- */
  cta: {
    heading: 'Ready to get your hours back?',
    line: 'One session. No commitment. See what’s possible.',
    button: 'Book a session',
  },

  /* ---- footer ---- */
  footer: {
    lead: 'Built once. Holds everything.',
    copy: '© 2026 Anno Domini — A Fractional AI Partner. United Kingdom.',
    barCells: ['Fractional AI Partner — Anno Domini', 'Precision that feels grown, not engineered.', 'Built once. Holds everything.'],
  },
};

export type Site = typeof site;
