/**
 * Booker — the expanding contact panel.
 *
 * A contact CTA (any [data-booker-open]) morphs into the full-screen #booker
 * panel using GSAP Flip: we capture the panel at its final full-screen layout,
 * fit it onto the clicked trigger's box, then animate back. The inner content
 * is held hidden during the flight so you only see the surface expand — the
 * cult-ui "expandable screen" feel, native to this site's GSAP stack.
 *
 * Submissions POST to Web3Forms (hidden access_key/subject/from_name fields in
 * the form). Progressive enhancement: with no JS the triggers keep their
 * mailto: fallback and this script never runs. Under reduced motion / no
 * html.motion, the panel opens and closes instantly (no Flip).
 */

import { gsap } from 'gsap';

// Flip (~25KB) is dead weight until someone actually opens the panel, so it is
// not in the entry chunk. Warm it in the background instead of awaiting it at
// click time: if a click somehow lands first, `Flip` is still null and the
// instant open/close path below — the one reduced-motion visitors get — runs.
let Flip: typeof import('gsap/Flip').Flip | null = null;
void import('gsap/Flip').then((m) => {
  gsap.registerPlugin(m.Flip);
  Flip = m.Flip;
});

// `:not([type="hidden"])` matters: the form opens with three hidden Web3Forms
// inputs, so without it the "focus the first field" call on open resolved to a
// hidden input, .focus() silently did nothing, and opening the dialog left
// keyboard focus stranded on the page behind it. The Tab trap below filters on
// offsetParent so it was unaffected — this is the shared fix for both.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function init() {
  const booker = document.getElementById('booker');
  if (!booker) return;

  const panel = booker.querySelector<HTMLElement>('.booker__panel');
  const inner = booker.querySelector<HTMLElement>('.booker__inner');
  const form = booker.querySelector<HTMLFormElement>('[data-booker-form]');
  const formView = booker.querySelector<HTMLElement>('[data-booker-view="form"]');
  const doneView = booker.querySelector<HTMLElement>('[data-booker-view="done"]');
  const errorEl = booker.querySelector<HTMLElement>('[data-booker-error]');
  const submitBtn = booker.querySelector<HTMLButtonElement>('.booker__submit');
  const submitLabel = booker.querySelector<HTMLElement>('[data-booker-submit-label]');
  if (!panel || !inner || !form || !formView || !doneView) return;

  const motion = document.documentElement.classList.contains('motion');
  const defaultSubmit = submitLabel?.textContent ?? '';
  const sendingText = form.dataset.sending ?? 'Sending…';

  let isOpen = false;
  let lastTrigger: HTMLElement | null = null;
  let activeTween: gsap.core.Tween | null = null;
  let flewOpen = false;

  /* ---- scroll lock (defer to Lenis when it's running) ---- */
  const lockScroll = () => {
    const lenis = (window as unknown as { __lenis?: { stop(): void; start(): void } }).__lenis;
    if (lenis) lenis.stop();
    else document.body.style.overflow = 'hidden';
  };
  const unlockScroll = () => {
    const lenis = (window as unknown as { __lenis?: { stop(): void; start(): void } }).__lenis;
    if (lenis) lenis.start();
    else document.body.style.overflow = '';
  };

  /* ---- pre-warm ----
   * The panel ships `hidden`, i.e. display:none, so the first open used to pay a
   * full layout and first paint of the whole form — ~26ms on a 4x-throttled CPU —
   * in the same frame the Flip started. That pushed the flight's opening frames
   * late and read as a jolt. Deferring the tween by a frame only moved the cost
   * (Lenis then hit the same dirty layout on its next scroll read), so instead
   * pay it once while the page is idle and nobody is waiting.
   *
   * `visibility: hidden` is the right resting state: out of the accessibility
   * tree, unfocusable and not hit-testable — same guarantees as display:none —
   * but fully laid out and layer-promoted. From here an open is a visibility flip
   * plus transforms, with no layout at all.
   *
   * warm() only ever runs under JS, so the no-JS path keeps the `hidden`
   * attribute and its display:none exactly as before. */
  const warm = () => {
    if (isOpen) return;
    booker.hidden = false;
    booker.style.visibility = 'hidden';
    void booker.offsetWidth;
  };
  const reveal = () => {
    booker.hidden = false;
    booker.style.visibility = '';
  };

  const idle: (cb: () => void) => void =
    window.requestIdleCallback?.bind(window) ?? ((cb) => void window.setTimeout(cb, 200));
  idle(warm);

  // focus the first field (or the close button)
  const focusFirstField = (delay: number) => {
    const firstField = form.querySelector<HTMLElement>(FOCUSABLE);
    window.setTimeout(() => firstField?.focus({ preventScroll: true }), delay);
  };

  /* ---- open ---- */
  const open = (trigger: HTMLElement) => {
    if (isOpen) return;
    isOpen = true;
    lastTrigger = trigger;
    activeTween?.kill();

    reveal();
    lockScroll();

    // Latched at open time so close animates the same way it opened, even if
    // Flip finished loading in between.
    flewOpen = motion && Flip !== null;

    if (!flewOpen || !Flip) {
      booker.classList.add('is-open');
      focusFirstField(0);
      return;
    }

    // `state` is the panel at its full-screen layout; `fit` then parks it on the
    // trigger. So the flight we want is current -> state, which is Flip.to().
    // This was Flip.from(), which plays state -> current, i.e. full-screen
    // shrinking onto the button, and the onComplete clearProps then snapped it
    // back to full size in a single frame. That snap was the visible jolt.
    const state = Flip.getState(panel);
    Flip.fit(panel, trigger, { scale: true });
    // `opacity`, deliberately not `autoAlpha`. autoAlpha also drives `visibility`,
    // and a visibility:hidden field cannot take focus — so the focus call below
    // was racing this tween's 0.22s delay and silently losing whenever the tween
    // started late, stranding keyboard focus outside an open modal. Opacity alone
    // hides the content just as well during the flight and never blocks focus.
    gsap.set(inner, { opacity: 0 });
    // The panel is transform-scaled, not resized, so its scrollbar would flash in
    // at the wrong size mid-flight. Restored once it has landed.
    panel.style.overflowY = 'hidden';
    booker.classList.add('is-open');

    activeTween = Flip.to(state, {
      duration: 0.55,
      ease: 'power3.out',
      scale: true,
      onComplete: () => {
        gsap.set(panel, { clearProps: 'transform' });
        panel.style.overflowY = '';
      },
    }) as unknown as gsap.core.Tween;
    gsap.to(inner, { opacity: 1, duration: 0.4, delay: 0.22, ease: 'power2.out' });

    focusFirstField(240);
  };

  /* ---- close ---- */
  const finishClose = () => {
    // Back to the warm resting state rather than display:none, so the second and
    // every later open stays as cheap as the first.
    booker.style.visibility = 'hidden';
    booker.classList.remove('is-open');
    gsap.set(panel, { clearProps: 'transform' });
    gsap.set(inner, { clearProps: 'opacity,visibility' });
    // Also covers an open interrupted mid-flight, where the tween's onComplete
    // never ran to restore it.
    panel.style.overflowY = '';
    unlockScroll();
    isOpen = false;
    // reset to the form view for next time
    formView.hidden = false;
    doneView.hidden = true;
    form.classList.remove('was-validated');
    if (errorEl) errorEl.hidden = true;
    lastTrigger?.focus({ preventScroll: true });
    lastTrigger = null;
  };

  const close = () => {
    if (!isOpen) return;
    activeTween?.kill();
    booker.classList.remove('is-open');

    if (flewOpen && Flip && lastTrigger) {
      panel.style.overflowY = 'hidden';
      gsap.to(inner, { opacity: 0, duration: 0.16, ease: 'power1.in' });
      activeTween = Flip.fit(panel, lastTrigger, {
        scale: true,
        duration: 0.42,
        ease: 'power3.in',
        onComplete: finishClose,
      }) as unknown as gsap.core.Tween;
    } else {
      finishClose();
    }
  };

  /* ---- focus trap + esc ---- */
  const onKeydown = (e: KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null,
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  document.addEventListener('keydown', onKeydown);

  /* ---- triggers + close controls ---- */
  document.querySelectorAll<HTMLElement>('[data-booker-open]').forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      open(trigger);
    });
  });
  booker.querySelectorAll<HTMLElement>('[data-booker-close]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      close();
    });
  });

  /* ---- submit → Web3Forms ---- */
  const setSubmitting = (on: boolean) => {
    if (!submitBtn) return;
    submitBtn.setAttribute('aria-disabled', String(on));
    if (submitLabel) submitLabel.textContent = on ? sendingText : defaultSubmit;
  };

  const showSuccess = () => {
    formView.hidden = true;
    doneView.hidden = false;
    if (motion) gsap.fromTo(doneView, { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'power2.out' });
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    form.classList.add('was-validated');
    if (!form.checkValidity()) {
      form.querySelector<HTMLElement>(':invalid')?.focus();
      return;
    }
    if (errorEl) errorEl.hidden = true;
    setSubmitting(true);

    try {
      const payload = Object.fromEntries(new FormData(form).entries());
      const res = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({ success: false }));
      if (json.success) {
        form.reset();
        showSuccess();
      } else if (errorEl) {
        errorEl.hidden = false;
      }
    } catch {
      if (errorEl) errorEl.hidden = false;
    } finally {
      setSubmitting(false);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
