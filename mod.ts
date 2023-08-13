import { deepEqual, html as uhtml, render } from "./deps.ts";

/* Declare global __imhtml object
 */
declare global {
  var __imhtml: {
    components: Set<ImHtml>,
  };
}

/* Compare two values. This doesn't compare functions as functions declared inside of the markup
will always be unequal. This will always be true for all non-primitives, so we deep compare objects. 
Return a boolean, true if equal and false if not */
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

/* Compare two arrays using compareTwo. 
Returns a boolean, true if arrays are equal and false if not. */
function compare(a: any[] | null, b: any[] | null) {
  if (!a || !b) return false;
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

/* Components call this when mounting to add the component to the shared update loop, and create it if it doesn't exist.
Not sure if I need to worry about maintaining the frameloop if the calling component is GC'ed. Could also use a weakmap instead of a set.
Not sure the implications of that. */
function createOrRegisterFrameLoop(comp: ImHtml){
  // frame loop established, just add to components
  if(globalThis.__imhtml){
    globalThis.__imhtml.components.add(comp)
    return
  }

  globalThis.__imhtml = {
    components: new Set<ImHtml>(),
  }

  globalThis.__imhtml.components.add(comp)

  function update(){
    for(const component of globalThis.__imhtml.components){
      if(!component.IMHTML_IS_VISIBLE) continue;
      const result: { strings: string[], values: any[] } = component.render()
      if(!compare(component.IMHTML_PREV_VALUES, result.values)){
        component.update(result.strings, result.values)
      }
      component.IMHTML_PREV_VALUES = result.values
    }
    requestAnimationFrame(update)
  }

  update()
}

/* Template tag function. Returns an object with the strings and values. Optionally, I could just return values. */
export function t(strings: TemplateStringsArray, ...values: any[]) {
  return { strings, values };
}

/* Re-export template fn */
export const h = uhtml

export default abstract class ImHtml extends HTMLElement {
  IMHTML_IS_VISIBLE = true;
  IMHTML_PREV_VALUES: any[] = [];

  static tag = "im-html";

  static use = (props?: Record<string, any> | null, children?: string) => {
    if(!props) props = {};
    const p = Object.keys(props).map((key) => `${key}="${props![key]}"`).join(" ");
    return `<${ImHtml.tag} ${p}>${children}</${ImHtml.tag}>`
  }

  // Intersection observer
  #__intersectionObserver: IntersectionObserver | null = null;

  protected template = t;
  protected t = t;

  protected html = h;
  protected h = h;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  abstract render(): { strings: TemplateStringsArray | string[] , values: any[] };

  update(template?: TemplateStringsArray | string[], values?: any[]){
    // if update is being called from the frame loop, we don't need to do anything
    // or else we will call render() to get the template and values
    if(!template || !values){
      const result = this.render()
      template = result.strings
      values = result.values
    }
    // @ts-ignore typescript is dumb
    render(this.shadowRoot!, uhtml(template, ...values))
  }

  /* LIFECYCLE METHODS ******************************************************

  These are called when the component is mounted or unmounted.
  */
  mount?(): void;
  unmount?(): void;

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
    // call mount functions
    this.#__mountCallbacks.forEach((callback) => callback());
    // call mount method
    this.mount?.();

    // create or register frame loop
    createOrRegisterFrameLoop(this)

    // add intersection observer to shadow root
    setTimeout(() => {
      if (this.shadowRoot?.host) {
        this.#__intersectionObserver = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              this.IMHTML_IS_VISIBLE = true;
            } else {
              this.IMHTML_IS_VISIBLE = false;
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
    globalThis.__imhtml.components.delete(this)
  }
}