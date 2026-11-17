'use client';

import { useEffect, useRef, type RefObject } from 'react';

let stack: HTMLElement[] = [];
let previousBodyOverflow = '';
const focusableSelector = 'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';

/** Shared focus, Escape and scroll contract for dialogs and expanded views. */
export function useModalInteraction(open: boolean, onClose: () => void, ref: RefObject<HTMLElement | null>) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open || !ref.current) return;
    const container = ref.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!stack.length) previousBodyOverflow = document.body.style.overflow;
    stack.push(container);
    document.body.style.overflow = 'hidden';
    const controls = () => Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(element => element.getClientRects().length);
    (controls()[0] || container).focus({ preventScroll: true });
    const handleKey = (event: KeyboardEvent) => {
      if (stack.at(-1) !== container) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const items = controls();
      const first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); container.focus(); }
      else if (event.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      stack = stack.filter(element => element !== container);
      if (!stack.length) document.body.style.overflow = previousBodyOverflow;
      const parent = stack.at(-1);
      if (previousFocus?.isConnected && (!parent || parent.contains(previousFocus))) previousFocus.focus({ preventScroll: true });
      else parent?.focus({ preventScroll: true });
    };
  }, [open, ref]);
}
