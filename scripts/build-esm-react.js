#!/usr/bin/env bun
// Build browser-compatible ESM modules for React and react/jsx-runtime
// from CJS node_modules files.

const fs = require("fs");
const path = require("path");

const SITE = "/home/team/shared/site";
const REACT_CJS = path.join(SITE, "node_modules/react/cjs/react.production.js");
const JSXRUNTIME_CJS = path.join(SITE, "node_modules/react/cjs/react-jsx-runtime.production.js");

function cjsToEsm(cjsPath, exportNames) {
  let cjs = fs.readFileSync(cjsPath, "utf-8");
  
  // The CJS files use `exports.X = ...` and reference `require("...")` internally
  // We need to handle the internal requires. React's CJS files require from:
  // - "react" (circular, for ReactSharedInternals)
  // - "object-assign" (for Object.assign polyfill)
  // - "scheduler" (for scheduler/tracing)
  // - "scheduler/tracing" 
  
  // Strategy: provide a simple require() shim that handles internal references.
  // For React itself, `require("react")` returns the module's own exports.
  // For other deps, we need to provide them or stub them.
  
  // Build the ESM wrapper
  const reactInternalRequire = `
    // Internal require() shim for CJS React code
    function __require(id) {
      if (id === "react") return __module.exports;
      // object-assign — provide Object.assign
      if (id === "object-assign") return Object.assign;
      // scheduler stubs
      if (id === "scheduler" || id === "scheduler/tracing") return {};
      throw new Error("Unexpected require: " + id);
    }
  `;
  
  const exportDestructure = exportNames.map(n => `  ${n}: __exports.${n}`).join(",\n");
  
  const esm = `// Browser-compatible ESM ${path.basename(cjsPath)}
// Auto-generated from CJS by build-esm-react.js
var __exports = {};
var __module = { exports: __exports };
(function() {
var exports = __exports;
var module = __module;
${reactInternalRequire}
var require = __require;
${cjs}
})();

// Named exports
${exportNames.map(n => `export const ${n} = __exports.${n};`).join("\n")}

// Default export
export default __exports;
`;
  return esm;
}

// React main: export all React APIs
const reactExports = [
  "Children", "Component", "Fragment", "Profiler", "PureComponent",
  "StrictMode", "Suspense", "act", "cloneElement", "createContext",
  "createElement", "createFactory", "createRef", "forwardRef", "isValidElement",
  "lazy", "memo", "startTransition", "useCallback", "useContext",
  "useDebugValue", "useDeferredValue", "useEffect", "useId",
  "useImperativeHandle", "useInsertionEffect", "useLayoutEffect",
  "useMemo", "useOptimistic", "useReducer", "useRef", "useState",
  "useSyncExternalStore", "useTransition", "useActionState", "version", "captureOwnerStack"
];

const reactEsm = cjsToEsm(REACT_CJS, reactExports);
fs.writeFileSync(path.join(SITE, "public/react.js"), reactEsm);
console.log(`Wrote public/react.js (${reactEsm.length} bytes)`);

// react/jsx-runtime: export jsx, jsxs, Fragment
const jsxRuntimeExports = ["jsx", "jsxs", "Fragment"];
const jsxRuntimeEsm = cjsToEsm(JSXRUNTIME_CJS, jsxRuntimeExports);
fs.writeFileSync(path.join(SITE, "public/react-jsx-runtime.js"), jsxRuntimeEsm);
console.log(`Wrote public/react-jsx-runtime.js (${jsxRuntimeEsm.length} bytes)`);

console.log("Done.");
