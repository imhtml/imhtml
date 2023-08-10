import { deepEqual, html as uhtml, render } from "./deps.ts";

declare global {
  var __imhtml: {
    components: Set<ImHtml>,
  };
}


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

export default abstract class ImHtml extends HTMLElement {
  IMHTML_IS_VISIBLE = true;
  IMHTML_PREV_VALUES: any[] = []
  // Intersection observer
  #__intersectionObserver: IntersectionObserver | null = null;

  abstract render(): { strings: string[], values: any[] };

  protected template = (strings: TemplateStringsArray, ...values: any[]) => ({
    strings,
    values,
  })

  protected html = uhtml

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  update(template?: string[], values?: any[]){
    // if update is being called from the frame loop, we don't need to do anything
    // or else we will call render() to get the template and values
    if(!template || !values){
      const result = this.render()
      template = result.strings
      values = result.values
    }
    console.log("Calling update")
    // @ts-ignore typescript is dumb
    render(this.shadowRoot!, uhtml(template, ...values))
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
