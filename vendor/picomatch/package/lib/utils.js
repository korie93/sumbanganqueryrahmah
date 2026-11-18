/*global navigator*/
'use strict';

const {
  REGEX_BACKSLASH,
  REGEX_SPECIAL_CHARS,
  REGEX_SPECIAL_CHARS_GLOBAL
} = require('./constants');

exports.isObject = val => val !== null && typeof val === 'object' && !Array.isArray(val);
exports.hasRegexChars = str => REGEX_SPECIAL_CHARS.test(str);
exports.isRegexChar = str => str.length === 1 && exports.hasRegexChars(str);
exports.escapeRegex = str => str.replace(REGEX_SPECIAL_CHARS_GLOBAL, '\\$1');
exports.toPosixSlashes = str => str.replace(REGEX_BACKSLASH, '/');

exports.isWindows = () => {
  if (typeof navigator !== 'undefined' && navigator.platform) {
    const platform = navigator.platform.toLowerCase();
    return platform === 'win32' || platform === 'windows';
  }

  if (typeof process !== 'undefined' && process.platform) {
    return process.platform === 'win32';
  }

  return false;
};

const isLineTerminator = ch => ch === '\n' || ch === '\r' || ch === '\u2028' || ch === '\u2029';

exports.removeBackslashes = str => {
  if (!str.includes('\\')) return str;
  const parts = [];
  let start = 0;
  let lookahead = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '[') {
      // Keep complete bracket expressions verbatim. A failed search up to
      // the next line break (or end) also rules out all later opens in it.
      lookahead = Math.max(lookahead, i + 1);
      while (lookahead < str.length) {
        const ch = str[lookahead];
        if (ch !== '\\' && str[lookahead + 1] === ']') {
          i = lookahead + 1;
          break;
        }
        if (isLineTerminator(ch)) break;
        lookahead++;
      }
    } else if (str[i] === '\\' && i + 1 < str.length && !isLineTerminator(str[i + 1])) {
      parts.push(str.slice(start, i));
      start = i + 1;
    }
  }
  return parts.length ? parts.join('') + str.slice(start) : str;
};

exports.escapeLast = (input, char, lastIdx) => {
  const idx = input.lastIndexOf(char, lastIdx);
  if (idx === -1) return input;
  if (input[idx - 1] === '\\') return exports.escapeLast(input, char, idx - 1);
  return `${input.slice(0, idx)}\\${input.slice(idx)}`;
};

exports.removePrefix = (input, state = {}) => {
  let output = input;
  if (output.startsWith('./')) {
    output = output.slice(2);
    state.prefix = './';
  }
  return output;
};

exports.wrapOutput = (input, state = {}, options = {}) => {
  const prepend = options.contains ? '' : '^';
  const append = options.contains ? '' : '$';

  let output = `${prepend}(?:${input})${append}`;
  if (state.negated === true) {
    output = `(?:^(?!${output}).*$)`;
  }
  return output;
};

exports.basename = (path, { windows } = {}) => {
  const segs = path.split(windows ? /[\\/]/ : '/');
  const last = segs[segs.length - 1];

  if (last === '') {
    return segs[segs.length - 2];
  }

  return last;
};
