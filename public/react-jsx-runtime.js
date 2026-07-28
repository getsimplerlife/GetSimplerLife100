// Browser-compatible ESM react-jsx-runtime.production.js
// Auto-generated from CJS by build-esm-react.js
var __exports = {};
var __module = { exports: __exports };
(function() {
var exports = __exports;
var module = __module;

    // Internal require() shim for CJS React code
    function __require(id) {
      if (id === "react") return __module.exports;
      // object-assign — provide Object.assign
      if (id === "object-assign") return Object.assign;
      // scheduler stubs
      if (id === "scheduler" || id === "scheduler/tracing") return {};
      throw new Error("Unexpected require: " + id);
    }
  
var require = __require;
/**
 * @license React
 * react-jsx-runtime.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

"use strict";
var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"),
  REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
function jsxProd(type, config, maybeKey) {
  var key = null;
  void 0 !== maybeKey && (key = "" + maybeKey);
  void 0 !== config.key && (key = "" + config.key);
  if ("key" in config) {
    maybeKey = {};
    for (var propName in config)
      "key" !== propName && (maybeKey[propName] = config[propName]);
  } else maybeKey = config;
  config = maybeKey.ref;
  return {
    $$typeof: REACT_ELEMENT_TYPE,
    type: type,
    key: key,
    ref: void 0 !== config ? config : null,
    props: maybeKey
  };
}
exports.Fragment = REACT_FRAGMENT_TYPE;
exports.jsx = jsxProd;
exports.jsxs = jsxProd;

})();

// Named exports
export const jsx = __exports.jsx;
export const jsxs = __exports.jsxs;
export const Fragment = __exports.Fragment;

// Default export
export default __exports;
