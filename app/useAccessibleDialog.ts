'use client';

import {useEffect, useRef} from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe:not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Keeps keyboard focus inside an open dialog, supports Escape and restores focus. */
export function useAccessibleDialog<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const dialogRef = useRef<T>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    // A modal must also remove the page behind it from mouse and assistive-tech navigation.
    // Inert the backdrop's siblings all the way up to body, then restore their previous state.
    const inerted = new Map<HTMLElement, boolean>();
    let branch: HTMLElement = dialog;
    while (branch.parentElement && branch.parentElement !== document.body) {
      const parent = branch.parentElement;
      for (const sibling of Array.from(parent.children)) {
        if (sibling === branch || !(sibling instanceof HTMLElement)) continue;
        if (!inerted.has(sibling)) inerted.set(sibling, sibling.inert);
        sibling.inert = true;
      }
      branch = parent;
    }

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableElements = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter(element => element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0);

    const initialFocus = window.requestAnimationFrame(() => {
      const first = focusableElements()[0];
      (first || dialog).focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = focusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) {
        (focusableElements()[0] || dialog).focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      window.cancelAnimationFrame(initialFocus);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
      for (const [element, wasInert] of inerted) element.inert = wasInert;
      inerted.clear();
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  return dialogRef;
}
