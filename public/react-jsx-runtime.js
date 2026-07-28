// Browser-compatible React JSX Runtime shim
// Provides jsx, jsxs, Fragment for SSR-built chunks that contain
// bare "import ... from 'react/jsx-runtime'" statements.
// Injected via import map by prod-server.ts.
var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
var REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
function jsxProd(type, config, maybeKey) {
  var key = null;
  if (maybeKey !== undefined) key = "" + maybeKey;
  if (config.key !== undefined) key = "" + config.key;
  if ("key" in config) {
    var props = {};
    for (var propName in config) {
      if (propName !== "key") props[propName] = config[propName];
    }
    config = props;
  }
  var ref = config.ref;
  return {
    $$typeof: REACT_ELEMENT_TYPE,
    type: type,
    key: key,
    ref: ref !== undefined ? ref : null,
    props: config
  };
}
export { REACT_FRAGMENT_TYPE as Fragment, jsxProd as jsx, jsxProd as jsxs };
