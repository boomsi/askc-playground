/* global globalThis */

/**
 * Preview guest runtime bootstrap.
 *
 * Keel's guest build externalizes react-native as the ReactNative global,
 * while the Engine exposes it through sandbox require('react-native').
 * Install the alias before any guest module can evaluate that external.
 */
(function initializeReactNativeGlobal() {
  // Keep a real host-provided global untouched when one already exists.
  if (typeof globalThis.ReactNative !== 'undefined') return;

  // Read require through an alias so Keel's external-rewrite pass does not
  // turn this bootstrap call back into the unresolved ReactNative identifier.
  var sandboxRequire = globalThis.require;
  if (typeof sandboxRequire !== 'function') {
    console.error('[askc-preview] react-native shim is unavailable');
    return;
  }

  try {
    globalThis.ReactNative = sandboxRequire('react-native');
  } catch (error) {
    console.error('[askc-preview] failed to initialize ReactNative global', error);
  }
})();
