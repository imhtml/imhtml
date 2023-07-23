import { deepEqual, html as uhtml, render } from "./deps.ts";

function compareTwo(a: any, b: any): boolean {
  // check if both are functions -> if so, we don't care (prevents inline functions from causing renders)
  if (typeof a === "function" && typeof b === "function") return true;
  // check strict equality
  if (a !== b) {
    // if both are objects
    if (typeof a === "object" && typeof b === "object") {
      // check deep equality
      if (!deepEqual(a, b)) return false;
      return true;
    }
    // not objects, thus return false
    return false;
  }
  // they're equal, return true
  return true;
}

function compare(a: any[] | null, b: any[] | null) {
  if(!a || !b) return false;
  // unequal lengths, return false early
  if (a.length !== b.length) return false;
  // check values
  for (let i = 0; i < a.length; i++) {
    if (!compareTwo(a[i], b[i])) {
      // cache the value to check first next time
      return false;
    }
  }
  return true;
}

export default abstract class ImHtml extends HTMLElement {
  // Values returned from this.html
  #previousRenderValues: any[] | null = null;
  // Whether or not the component is visible
  #isVisible = true;
  // Intersection observer
  #__intersectionObserver: IntersectionObserver | null = null;

  abstract render(): any;

  protected html = uhtml;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  // declare lifecycle methods and events
  abstract mount?(): void;
  abstract unmount?(): void;

  #__mountCallbacks = new Set<() => void>();
  #__unmountCallbacks = new Set<() => void>();

  protected onMount = (callback: () => void) => {
    this.#__mountCallbacks.add(callback);
    return () => {
      this.#__mountCallbacks.delete(callback);
    };
  };
  protected onUnmount = (callback: () => void) => {
    this.#__unmountCallbacks.add(callback);
    return () => {
      this.#__unmountCallbacks.delete(callback);
    };
  };

  connectedCallback() {
    // create update function and start frameloop
    const update = () => {
      // check if visible
      if (!this.#isVisible) return requestAnimationFrame(update);
      // call render function to diff
      this.render();
      requestAnimationFrame(update);
    };
    // start frameloop
    requestAnimationFrame(update);
    // call mount functions
    this.#__mountCallbacks.forEach((callback) => callback());
    // call mount method
    this.mount?.();
    // add intersection observer to shadow root
    setTimeout(() => {
      if (this.shadowRoot?.host) {
        this.#__intersectionObserver = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              this.#isVisible = true;
            } else {
              this.#isVisible = false;
            }
          });
        }, {
          rootMargin: "100px",
        });
        this.#__intersectionObserver.observe(this.shadowRoot.host);
      }
    }, 100);
  }
  disconnectedCallback() {
    this.#__unmountCallbacks.forEach((callback) => callback());
    this.unmount?.();
    this.#__intersectionObserver?.disconnect();
  }

  protected template = (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => {
    if (!compare(this.#previousRenderValues, values)) {
      this.#previousRenderValues = values;
      render(this.shadowRoot!, uhtml(strings, ...values));
    }
  };
}
