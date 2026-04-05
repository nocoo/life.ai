// 测试环境设置
import { Window } from "happy-dom";

// Setup global DOM environment for React component testing
const window = new Window({ url: "http://localhost:3000" });

// Register globals
Object.assign(globalThis, {
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  customElements: window.customElements,
});
