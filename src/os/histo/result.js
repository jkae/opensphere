goog.module('os.histo.Result');
goog.module.declareLegacyNamespace();

const Bin = goog.requireType('os.histo.Bin');

/**
 * @typedef {{
 *  key: (string|number),
 *  value: !Bin
 * }}
 */
let Result;

exports = Result;
