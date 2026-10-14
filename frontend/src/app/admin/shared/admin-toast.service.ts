import { Injectable, signal } from '@angular/core';

export type ToastTone = 'success' | 'error' | 'info';

export interface AdminToast {
  id: number;
  tone: ToastTone;
  message: string;
  /** Auto-dismiss delay in ms (also drives the progress bar). */
  duration: number;
}

/** Admin notifications after saves and actions, shown top-right (see AdminToasts). */
@Injectable({ providedIn: 'root' })
export class AdminToastService {
  private nextId = 1;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  readonly toasts = signal<AdminToast[]>([]);

  success(message: string): void {
    this.show('success', message, 4000);
  }

  /** Errors stay a little longer so there's time to read them. */
  error(message: string): void {
    this.show('error', message, 7000);
  }

  info(message: string): void {
    this.show('info', message, 4500);
  }

  dismiss(id: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  /** Hovering a toast keeps it open; leaving restarts a short timer. */
  hold(id: number): void {
    clearTimeout(this.timers.get(id));
  }

  release(id: number): void {
    this.schedule(id, 2500);
  }

  private show(tone: ToastTone, message: string, duration: number): void {
    // The same message twice in a row (e.g. a double click) replaces the earlier one.
    const existing = this.toasts().find((t) => t.message === message && t.tone === tone);
    if (existing) this.dismiss(existing.id);
    const toast: AdminToast = { id: this.nextId++, tone, message, duration };
    this.toasts.update((list) => [...list.slice(-3), toast]);
    this.schedule(toast.id, duration);
  }

  private schedule(id: number, ms: number): void {
    clearTimeout(this.timers.get(id));
    this.timers.set(id, setTimeout(() => this.dismiss(id), ms));
  }
}
