import { ViewportScroller } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterOutlet, Scroll } from '@angular/router';
import { filter } from 'rxjs';

import { ToastOutlet } from './shared/toast/toast-outlet';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastOutlet],
  template: '<router-outlet /><app-toast-outlet />',
})
export class App {
  constructor() {
    const scroller = inject(ViewportScroller);
    let lastPath: string | null = null;

    // Back/forward restores the previous position; a new page starts at the top; changing only the
    // query string (filters, sort) keeps the current position.
    inject(Router)
      .events.pipe(filter((e): e is Scroll => e instanceof Scroll))
      .subscribe((e) => {
        const event = e.routerEvent;
        const path = ('urlAfterRedirects' in event ? event.urlAfterRedirects : event.url).split(/[?#]/)[0];
        if (e.position) {
          scroller.scrollToPosition(e.position);
        } else if (e.anchor) {
          scroller.scrollToAnchor(e.anchor);
        } else if (path !== lastPath) {
          scroller.scrollToPosition([0, 0]);
        }
        lastPath = path;
      });
  }
}
