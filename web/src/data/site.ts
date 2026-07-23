/**
 * Single source of truth for all site content.
 *
 * Copy is written against WEBSITE-COPY-SOURCE.md (the offer). Voice rules from
 * its §0 apply to every string here: British English, no exclamation marks, no
 * em/en dashes used as a pause (commas or full stops instead; hyphenated
 * compounds are fine), understated, the catch stated not hidden.
 *
 * Every component reads from `site` — nothing is hard-coded in markup. To change
 * wording, edit this file only.
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
  /** Optional stated terms rendered as a bullet list under the description. */
  terms?: string[];
}

export interface ProofImage {
  src: string;
  alt: string;
}

export interface ProofBar {
  title: string;
  note: string;
}

export interface MenuSystem {
  name: string;
  /** True for systems already running inside small transportation businesses. */
  live?: boolean;
  text: string;
}

export interface MenuGroup {
  title: string;
  systems: MenuSystem[];
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
  brandFull: 'Anno Domini · A Fractional AI Partner',
  // Wordmark logo (the "AD" leaf). Monochrome dark artwork on a transparent
  // background — the CSS flips it to light over the hero photo / dark theme.
  logo: '/assets/anno-domini-logo.png',
  logoAlt: 'Anno Domini',
  tagline: 'Anno Domini · A fractional AI partner, UK',
  description:
    'Your diary, CRM, inbox and spreadsheets already do their jobs. Nothing makes them talk to each other. Anno Domini builds the system that does, integrated with the tools you already run, and you own it outright.',
  email: 'hello@os.partners',
  region: 'United Kingdom',

  /* ---- navigation ---- */
  nav: [
    { label: 'What we build', href: '#approach' },
    { label: 'How it works', href: '#insights' },
    { label: 'Ways in', href: '#ladder' },
  ] as NavLink[],
  navCta: 'Get in touch',

  /* ---- hero ---- */
  hero: {
    image: '/assets/hero-banner.webp',
    imageAlt: 'Light through timber structure',
    sub: 'Anno Domini · A fractional AI partner, UK',
    // `headlineLead` + emphasised `headlineEm` render as: "… <em>agency.</em>"
    headlineLead: 'Infrastructure that returns ',
    headlineEm: 'agency.',
    cta: 'See how it works',
    ctaHref: '#approach',
    // Honest framing: the weekly time a small firm loses to work nothing
    // connects (roughly 5h + 6h + 3h from the problem section), not a claimed
    // client average.
    stat: {
      cap: 'The weekly cost',
      value: '14',
      unit: 'hrs',
      note: 'lost to work nothing connects',
    },
  },

  /* ---- manifesto ---- */
  manifesto: {
    image: '/assets/manifesto-bg.webp',
    imageAlt: 'Raw timber beam in shadow',
    heading: 'Built to return agency.',
    principles: [
      { icon: ICONS.bolt, text: 'We build systems that give time and decision-making back to the people doing the work.' },
      { icon: ICONS.target, text: 'Infrastructure should be invisible. Load-bearing, and already part of the building by the time you notice it.' },
      { icon: ICONS.origami, text: 'We integrate, never replace. The build reads off the tools you already run instead of asking you to switch.' },
      { icon: ICONS.person, text: 'AI should remove the work that was never worth doing, so the work that is gets the full weight of human attention.' },
    ] as Principle[],
    foot: 'Precision that feels grown, not engineered.',
  },

  /* ---- problem ---- */
  problem: {
    label: 'The problem',
    // `b` segments render bold inside the statement.
    items: [
      { pre: 'Getting the work in, keeping it moving, staying visible, handling the admin: ', b: 'four jobs a small firm runs by hand', post: ' because nothing connects the tools that should do them.' },
      { pre: 'Five hours a week on a database nobody works. Six hours on ', b: '“any news?” emails', post: '. Three hours every Friday rebuilding the same report.' },
      { pre: 'None of it is the work you started the business to do, and none of it is worth a ', b: 'full-time hire', post: '.' },
    ],
  },

  /* ---- solution ---- */
  solution: {
    label: 'What we build',
    heading: 'A set of systems built around how your business actually works, then handed over completely.',
    body: 'Not a subscription. Not a generic automation platform. The same engine underneath every build, with your data and workflow on top. It reads off the tools you already run, and you own it outright.',
    // Teaser for the Build Menu below: the four groups the systems fall into.
    index: ['Win the work', 'Keep it moving', 'Be seen', 'Handle the admin'],
    device: {
      image: '/assets/solution-bg.webp',
      imageAlt: 'Timber work surface',
      core: 'System<br>by design',
      caption: 'Manual work in. Owned, documented systems out.',
    },
  },

  /* ---- build menu (the systems) ---- */
  buildMenu: {
    label: 'The build menu',
    lede: 'You do not buy the menu. You pick the one job that wastes the most hours, and that is the next build. Systems marked live today are already running inside small transportation businesses.',
    groups: [
      {
        title: 'Win the work',
        systems: [
          { name: 'CRM Revival Engine', live: true, text: 'Reactivates dormant contacts and surfaces the warm ones worth a call. Removes about five hours a week.' },
          { name: 'Lead Sourcing & Scoring', text: 'Finds businesses matching your ideal client, verifies the detail, scores each and drafts a first approach. You keep the final say on every send.' },
          { name: 'Inbound Query Handler', live: true, text: 'Filters genuine enquiries, answers the routine questions, books the calls worth having. Removes about four hours a week.' },
        ],
      },
      {
        title: 'Keep it moving',
        systems: [
          { name: 'Client Communication Engine', live: true, text: 'Sends progress updates automatically at every stage, in your voice. Removes about six hours a week of “any news?” emails.' },
          { name: 'Pipeline Intelligence Dashboard', live: true, text: 'One live view of every deal, stage and revenue probability. The Friday spreadsheet is gone. Removes about three hours a week.' },
        ],
      },
      {
        title: 'Be seen',
        systems: [
          { name: 'Content Engine', text: 'One brief in, channel-ready copy out for newsletter, social and blog at once, in your voice.' },
          { name: 'Lifecycle Follow-up', text: 'Runs the sequences a busy owner never gets to: quote follow-ups, re-engagement, review requests. Stops the moment someone replies.' },
          { name: 'Founder Voice', text: 'An optional module that turns a five-minute voice note into posts that sound like you, not a template.' },
        ],
      },
      {
        title: 'Handle the admin',
        systems: [
          { name: 'Screening & Shortlist Builder', live: true, text: 'Scores each applicant or submission against your brief and returns a ready shortlist in minutes.' },
          { name: 'Document & Quote Generator', live: true, text: 'A short brief in, a polished document out, in your house style. Quotes, listings, reports.' },
        ],
      },
    ] as MenuGroup[],
    foot: 'Every system is built once, documented, and handed over. You own it outright. The only running cost is your own accounts, usually under £30 a month, stated before we build.',
  },

  /* ---- how it works ---- */
  howItWorks: {
    label: 'How it works',
    lede: 'Every build runs the same way. One clear problem, one measurable output.',
    steps: [
      { num: '01', label: 'Brief', body: 'One call. We agree the single problem and the output that proves it worked. Scope stays tight and is written down.' },
      { num: '02', label: 'Build', body: 'Three to seven days, heads down. A working system, built to be reused.' },
      { num: '03', label: 'Deliver', body: 'A walkthrough, a one-page SOP, a handover. You own it completely.' },
      { num: '04', label: 'Repeat', body: 'Every delivery surfaces the next. The system grows with the business.' },
    ] as Step[],
  },

  /* ---- ladder ---- */
  ladder: {
    label: 'Three ways in',
    rungs: [
      {
        label: 'Founding Build',
        desc: 'One system from the menu, built free and yours to keep. This is how we begin with the people we work with first. The terms are the offer, not the small print, and all of them are stated up front.',
        tag: 'Start here',
        active: true,
        terms: [
          'A 30-minute scoping call. Your system of record named, access granted live. If access or the data fails, the clock never starts.',
          'A one-page signed scope. It protects you from scope creep and binds you to nothing.',
          'Live within 14 days of access being granted.',
          'Handover: a walkthrough, a one-page SOP, and a question a week for 30 days.',
          'The stated catch: a 20-minute debrief at the end, and permission to write the build up as a case study, anonymised on request. No catch beyond that, that is the whole reason.',
          'Capacity is two at a time, one ever in active build. When both are taken, a dated waitlist, not silence.',
        ],
      },
      {
        label: 'The Audit',
        desc: 'A discovery session, a written report ranking your top three opportunities by return, and one working system built and live within days or you do not pay. Includes the walkthrough, SOP and 30 days of support. It pays for itself in the first build.',
        tag: '·',
      },
      {
        label: 'The Retainer',
        desc: 'Up to two build cycles a month, a weekly brief call, new tools as the business grows, and a quarterly review. Most start with one system on a real problem, and the rest of the menu opens on its own.',
        tag: '·',
      },
    ] as Rung[],
  },

  /* ---- proof ---- */
  proof: {
    label: 'Proof',
    statement: 'Already running inside a real business.',
    body: 'These systems are not a demo. Several are already running inside small transportation businesses today, built and deployed in live operations before a single external client was taken on.',
    images: [
      { src: '/assets/proof-3-pipeline.webp', alt: 'Pipeline reporting view' },
      { src: '/assets/proof-2-newsletter.webp', alt: 'Client communication engine' },
      { src: '/assets/proof-1-email.webp', alt: 'Lead follow-up system' },
    ] as ProofImage[],
    bars: [
      { title: 'Reporting and pipeline', note: '147 live deals, refreshed every six hours' },
      { title: 'Client communication', note: '847 contacts enrolled, updates sent automatically' },
      { title: 'Lead follow-up', note: 'Dormant contacts revived, a human approving every send' },
    ] as ProofBar[],
  },

  /* ---- cta ---- */
  cta: {
    heading: 'Tell me where the time goes.',
    line: 'Pick the one job that wastes the most hours. That is the next build.',
    button: 'Start a conversation',
  },

  /* ---- footer ---- */
  footer: {
    lead: 'Built once. Holds everything.',
    copy: '© 2026 Anno Domini · A fractional AI partner. United Kingdom.',
    barCells: ['Anno Domini · A fractional AI partner', 'Precision that feels grown, not engineered.', 'Built once. Holds everything.'],
  },

  /* ---- booker (the expanding contact panel) ---- */
  // Copy for the full-screen enquiry panel that the contact CTAs morph into.
  // Submissions post to Web3Forms (see scripts/booker.ts) and land in the inbox
  // registered to PUBLIC_WEB3FORMS_KEY. `subject` is the email subject line.
  booker: {
    label: 'Start a conversation',
    heading: 'Tell me where the time goes.',
    intro: 'One message, no commitment. We read every enquiry ourselves and reply within a couple of working days.',
    subject: 'New enquiry: Anno Domini',
    fields: {
      name: { label: 'Name', placeholder: 'Your name' },
      email: { label: 'Email', placeholder: 'you@company.com' },
      message: { label: 'Where does the time go?', placeholder: 'A line or two on the one job that wastes the most hours…' },
    },
    submit: 'Send message',
    sending: 'Sending…',
    close: 'Close',
    // Privacy notice shown under the submit button. `policyHref` points at the
    // privacy page.
    consent: 'By sending this you agree we may use your details to respond to your enquiry.',
    policyText: 'Privacy',
    policyHref: '/privacy',
    success: {
      heading: 'Message received.',
      body: 'Thanks, we have it. Expect a reply within a couple of working days.',
    },
    // Shown if the POST fails (e.g. missing access key). Falls back to email.
    error: 'Something went wrong sending that. You can email us directly instead:',
  },
};

export type Site = typeof site;
