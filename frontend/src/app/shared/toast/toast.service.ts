import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; link: string };
  tone?: 'default' | 'success' | 'error';
}

/** Short, single-line notifications (design.md §6.8): bottom-centre on mobile, 3s. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  readonly toasts = signal<Toast[]>([]);

  show(message: string, options: Omit<Toast, 'id' | 'message'> = {}, durationMs = 3000): void {
    const toast: Toast = { id: this.nextId++, message, ...options };
    this.toasts.update((list) => [...list.slice(-2), toast]);
    setTimeout(() => this.dismiss(toast.id), durationMs);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
