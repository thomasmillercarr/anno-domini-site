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
import { Flip } from 'gsap/Flip';

gsap.registerPlugin(Flip);

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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

  /* ---- open ---- */
  const open = (trigger: HTMLElement) => {
    if (isOpen) return;
    isOpen = true;
    lastTrigger = trigger;
    activeTween?.kill();

    booker.hidden = false;
    // reflow so the scrim's opacity transition runs from 0
    void booker.offsetWidth;
    booker.classList.add('is-open');
    lockScroll();

    if (motion) {
      const state = Flip.getState(panel);
      Flip.fit(panel, trigger, { scale: true });
      gsap.set(inner, { autoAlpha: 0 });
      activeTween = Flip.from(state, {
        duration: 0.55,
        ease: 'power3.out',
        scale: true,
        onComplete: () => gsap.set(panel, { clearProps: 'transform' }),
      }) as unknown as gsap.core.Tween;
      gsap.to(inner, { autoAlpha: 1, duration: 0.4, delay: 0.22, ease: 'power2.out' });
    }

    // focus the first field (or the close button)
    const firstField = form.querySelector<HTMLElement>(FOCUSABLE);
    window.setTimeout(() => firstField?.focus({ preventScroll: true }), motion ? 240 : 0);
  };

  /* ---- close ---- */
  const finishClose = () => {
    booker.hidden = true;
    booker.classList.remove('is-open');
    gsap.set(panel, { clearProps: 'transform' });
    gsap.set(inner, { clearProps: 'opacity,visibility' });
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

    if (motion && lastTrigger) {
      gsap.to(inner, { autoAlpha: 0, duration: 0.16, ease: 'power1.in' });
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
