/**
 * JavaScript evaluated inside the QuickJS sandbox before every user script.
 * It builds a Postman-compatible `pm` object (and `pk` alias) on top of the
 * JSON input in `__input`, and records everything the script does into `__out`.
 *
 * The sandbox has no network, DOM, filesystem or host functions: data goes in
 * as JSON and comes out as JSON. Keep this file free of backticks and `${`.
 */
export const PRELUDE = String.raw`
"use strict";
var __out = {
  variables: __input.variables,
  request: null,
  tests: [],
  logs: [],
  nextRequest: undefined,
  skipRequest: false,
  error: null,
  visualizer: null
};

function __str(v) {
  if (typeof v === "string") return v;
  if (v === undefined) return "undefined";
  if (v === null) return "null";
  if (typeof v === "object") { try { return JSON.stringify(v); } catch (e) { return String(v); } }
  return String(v);
}
function __fmt(v) {
  if (typeof v === "string") return JSON.stringify(v);
  if (v === undefined) return "undefined";
  if (typeof v === "function") return "[Function]";
  try { return JSON.stringify(v); } catch (e) { return String(v); }
}
function __typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (v instanceof RegExp) return "regexp";
  if (v instanceof Date) return "date";
  return typeof v;
}
function __deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number" && a !== a && b !== b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  var ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (var i = 0; i < ka.length; i++) {
    if (!Object.prototype.hasOwnProperty.call(b, ka[i])) return false;
    if (!__deepEqual(a[ka[i]], b[ka[i]])) return false;
  }
  return true;
}

/* ---------- console ---------- */
var console = {};
["log", "info", "warn", "error", "debug"].forEach(function (level) {
  console[level] = function () {
    var args = Array.prototype.slice.call(arguments).map(function (a) {
      if (typeof a === "string") return a;
      if (a instanceof Error) return a.name + ": " + a.message;
      return __fmt(a);
    });
    __out.logs.push({ level: level === "debug" ? "log" : level, args: args });
  };
});

/* ---------- base64 (latin1) ---------- */
var __B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function btoa(input) {
  var str = String(input), out = "";
  for (var i = 0; i < str.length; i += 3) {
    var a = str.charCodeAt(i), b = str.charCodeAt(i + 1), c = str.charCodeAt(i + 2);
    if (a > 255 || b > 255 || c > 255) throw new Error("btoa: karakter di luar Latin1");
    var n = (a << 16) | ((b || 0) << 8) | (c || 0);
    out += __B64[(n >> 18) & 63] + __B64[(n >> 12) & 63] + (i + 1 < str.length ? __B64[(n >> 6) & 63] : "=") + (i + 2 < str.length ? __B64[n & 63] : "=");
  }
  return out;
}
function atob(input) {
  var str = String(input).replace(/[^A-Za-z0-9+/]/g, ""), out = "";
  for (var i = 0; i < str.length; i += 4) {
    var n = (__B64.indexOf(str[i]) << 18) | (__B64.indexOf(str[i + 1]) << 12) | ((__B64.indexOf(str[i + 2]) & 63) << 6) | (__B64.indexOf(str[i + 3]) & 63);
    out += String.fromCharCode((n >> 16) & 255);
    if (str[i + 2] !== undefined) out += String.fromCharCode((n >> 8) & 255);
    if (str[i + 3] !== undefined) out += String.fromCharCode(n & 255);
  }
  return out;
}
function setTimeout(fn) { Promise.resolve().then(function () { fn(); }); return 0; }
function clearTimeout() {}
function require(name) {
  throw new Error("require('" + name + "') belum didukung di Packetman MVP.");
}

/* ---------- assertions (chai-compatible subset) ---------- */
function AssertionError(message) { var e = new Error(message); e.name = "AssertionError"; return e; }
function Assertion(obj, msg) { this._obj = obj; this._negate = false; this._deep = false; this._msg = msg; }
Assertion.prototype._assert = function (cond, positive, negative) {
  var ok = this._negate ? !cond : !!cond;
  if (!ok) throw AssertionError((this._msg ? this._msg + ": " : "") + (this._negate ? negative : positive));
  return this;
};
["to", "be", "been", "is", "that", "which", "and", "has", "have", "with", "at", "of", "same", "but", "does", "still", "also"].forEach(function (w) {
  Object.defineProperty(Assertion.prototype, w, { get: function () { return this; } });
});
Object.defineProperty(Assertion.prototype, "not", { get: function () { this._negate = !this._negate; return this; } });
Object.defineProperty(Assertion.prototype, "deep", { get: function () { this._deep = true; return this; } });
function __getter(proto, name, fn) { Object.defineProperty(proto, name, { configurable: true, get: function () { fn.call(this); return this; } }); }
function __method(proto, names, fn) { names.forEach(function (n) { proto[n] = fn; }); }
var AP = Assertion.prototype;
__getter(AP, "ok", function () { this._assert(this._obj, "expected " + __fmt(this._obj) + " to be truthy", "expected " + __fmt(this._obj) + " to be falsy"); });
__getter(AP, "true", function () { this._assert(this._obj === true, "expected " + __fmt(this._obj) + " to be true", "expected " + __fmt(this._obj) + " not to be true"); });
__getter(AP, "false", function () { this._assert(this._obj === false, "expected " + __fmt(this._obj) + " to be false", "expected " + __fmt(this._obj) + " not to be false"); });
__getter(AP, "null", function () { this._assert(this._obj === null, "expected " + __fmt(this._obj) + " to be null", "expected value not to be null"); });
__getter(AP, "undefined", function () { this._assert(this._obj === undefined, "expected " + __fmt(this._obj) + " to be undefined", "expected value not to be undefined"); });
__getter(AP, "NaN", function () { this._assert(this._obj !== this._obj, "expected " + __fmt(this._obj) + " to be NaN", "expected value not to be NaN"); });
__getter(AP, "exist", function () { this._assert(this._obj !== null && this._obj !== undefined, "expected value to exist", "expected " + __fmt(this._obj) + " not to exist"); });
__getter(AP, "empty", function () {
  var o = this._obj, len = (typeof o === "string" || Array.isArray(o)) ? o.length : (o && typeof o === "object" ? Object.keys(o).length : 0);
  this._assert(len === 0, "expected " + __fmt(o) + " to be empty", "expected " + __fmt(o) + " not to be empty");
});
__method(AP, ["equal", "equals", "eq"], function (v, msg) {
  if (msg) this._msg = msg;
  var cond = this._deep ? __deepEqual(this._obj, v) : this._obj === v;
  return this._assert(cond, "expected " + __fmt(this._obj) + " to equal " + __fmt(v), "expected " + __fmt(this._obj) + " to not equal " + __fmt(v));
});
__method(AP, ["eql", "eqls"], function (v, msg) {
  if (msg) this._msg = msg;
  return this._assert(__deepEqual(this._obj, v), "expected " + __fmt(this._obj) + " to deeply equal " + __fmt(v), "expected " + __fmt(this._obj) + " to not deeply equal " + __fmt(v));
});
__method(AP, ["above", "gt", "greaterThan"], function (n) { return this._assert(this._obj > n, "expected " + __fmt(this._obj) + " to be above " + n, "expected " + __fmt(this._obj) + " to be at most " + n); });
__method(AP, ["below", "lt", "lessThan"], function (n) { return this._assert(this._obj < n, "expected " + __fmt(this._obj) + " to be below " + n, "expected " + __fmt(this._obj) + " to be at least " + n); });
__method(AP, ["least", "gte"], function (n) { return this._assert(this._obj >= n, "expected " + __fmt(this._obj) + " to be at least " + n, "expected " + __fmt(this._obj) + " to be below " + n); });
__method(AP, ["most", "lte"], function (n) { return this._assert(this._obj <= n, "expected " + __fmt(this._obj) + " to be at most " + n, "expected " + __fmt(this._obj) + " to be above " + n); });
__method(AP, ["within"], function (a, b) { return this._assert(this._obj >= a && this._obj <= b, "expected " + __fmt(this._obj) + " to be within " + a + ".." + b, "expected " + __fmt(this._obj) + " to not be within " + a + ".." + b); });
__method(AP, ["a", "an"], function (type) {
  var t = String(type).toLowerCase(), actual = __typeOf(this._obj);
  return this._assert(actual === t, "expected " + __fmt(this._obj) + " to be a " + t + " (got " + actual + ")", "expected " + __fmt(this._obj) + " not to be a " + t);
});
__method(AP, ["include", "includes", "contain", "contains"], function (v) {
  var o = this._obj, cond = false;
  if (typeof o === "string") cond = o.indexOf(v) !== -1;
  else if (Array.isArray(o)) cond = o.some(function (x) { return __deepEqual(x, v); });
  else if (o && typeof o === "object" && v && typeof v === "object") cond = Object.keys(v).every(function (k) { return __deepEqual(o[k], v[k]); });
  return this._assert(cond, "expected " + __fmt(o) + " to include " + __fmt(v), "expected " + __fmt(o) + " to not include " + __fmt(v));
});
__method(AP, ["property"], function (name, val) {
  var o = this._obj, has = o !== null && o !== undefined && (typeof o === "object" || typeof o === "function") && name in o;
  if (arguments.length > 1) {
    var cond = has && (this._deep ? __deepEqual(o[name], val) : o[name] === val);
    this._assert(cond, "expected " + __fmt(o) + " to have property " + __fmt(name) + " of " + __fmt(val) + (has ? " (got " + __fmt(o[name]) + ")" : ""), "expected " + __fmt(o) + " to not have property " + __fmt(name) + " of " + __fmt(val));
  } else {
    this._assert(has, "expected " + __fmt(o) + " to have property " + __fmt(name), "expected " + __fmt(o) + " to not have property " + __fmt(name));
  }
  if (has && !this._negate) this._obj = o[name];
  return this;
});
__method(AP, ["lengthOf", "length"], function (n) {
  var len = this._obj === null || this._obj === undefined ? undefined : this._obj.length;
  return this._assert(len === n, "expected " + __fmt(this._obj) + " to have length " + n + " (got " + len + ")", "expected " + __fmt(this._obj) + " to not have length " + n);
});
__method(AP, ["match", "matches"], function (re) { return this._assert(re.test(String(this._obj)), "expected " + __fmt(this._obj) + " to match " + re, "expected " + __fmt(this._obj) + " not to match " + re); });
__method(AP, ["string"], function (s) { return this._assert(String(this._obj).indexOf(s) !== -1, "expected " + __fmt(this._obj) + " to contain " + __fmt(s), "expected " + __fmt(this._obj) + " to not contain " + __fmt(s)); });
__method(AP, ["oneOf"], function (list) { var o = this._obj; return this._assert(list.some(function (x) { return __deepEqual(x, o); }), "expected " + __fmt(o) + " to be one of " + __fmt(list), "expected " + __fmt(o) + " to not be one of " + __fmt(list)); });
__method(AP, ["keys", "key"], function () {
  var want = Array.isArray(arguments[0]) ? arguments[0] : Array.prototype.slice.call(arguments), o = this._obj || {};
  return this._assert(want.every(function (k) { return Object.prototype.hasOwnProperty.call(o, k); }), "expected " + __fmt(o) + " to have keys " + __fmt(want), "expected " + __fmt(o) + " to not have keys " + __fmt(want));
});
__method(AP, ["throw", "throws", "Throw"], function () {
  var threw = false;
  try { this._obj(); } catch (e) { threw = true; }
  return this._assert(threw, "expected function to throw", "expected function not to throw");
});

/* ---------- variable scopes ---------- */
var __ORDER = ["local", "data", "environment", "collection", "global"];
function __lookup(name) {
  for (var i = 0; i < __ORDER.length; i++) {
    var s = __out.variables[__ORDER[i]];
    if (Object.prototype.hasOwnProperty.call(s, name)) return s[name];
  }
  return undefined;
}
function __replaceIn(template) {
  return String(template).replace(/\{\{\s*([^{}\s][^{}]*?)\s*\}\}/g, function (m, name) {
    name = name.trim();
    if (name === "$guid" || name === "$randomUUID") return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) { var r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16); });
    if (name === "$timestamp") return String(Math.floor(Date.now() / 1000));
    if (name === "$isoTimestamp") return new Date().toISOString();
    if (name === "$randomInt") return String(Math.floor(Math.random() * 1001));
    var v = __lookup(name);
    return v === undefined ? m : v;
  });
}
function __scope(name, readOnly) {
  var store = function () { return __out.variables[name]; };
  var api = {
    get: function (k) { return store()[k]; },
    has: function (k) { return Object.prototype.hasOwnProperty.call(store(), k); },
    toObject: function () { return JSON.parse(JSON.stringify(store())); },
    replaceIn: __replaceIn
  };
  if (!readOnly) {
    api.set = function (k, v) { store()[k] = __str(v); };
    api.unset = function (k) { delete store()[k]; };
    api.clear = function () { var s = store(); Object.keys(s).forEach(function (k) { delete s[k]; }); };
  }
  return api;
}

/* ---------- header list ---------- */
function __headerList(pairs) {
  var items = pairs.map(function (p) { return { key: p[0], value: p[1] }; });
  function idx(k) { k = String(k).toLowerCase(); for (var i = 0; i < items.length; i++) if (items[i].key.toLowerCase() === k) return i; return -1; }
  return {
    _items: items,
    get: function (k) { var i = idx(k); return i < 0 ? undefined : items[i].value; },
    has: function (k, v) { var i = idx(k); return i >= 0 && (arguments.length < 2 || items[i].value === v); },
    add: function (h) { items.push({ key: String(h.key), value: __str(h.value) }); },
    upsert: function (h) { var i = idx(h.key); if (i < 0) items.push({ key: String(h.key), value: __str(h.value) }); else items[i].value = __str(h.value); },
    remove: function (k) { var key = typeof k === "string" ? k : k.key; for (var i = items.length - 1; i >= 0; i--) if (items[i].key.toLowerCase() === String(key).toLowerCase()) items.splice(i, 1); },
    toObject: function () { var o = {}; items.forEach(function (h) { o[h.key] = h.value; }); return o; },
    all: function () { return items.slice(); },
    each: function (fn) { items.forEach(fn); },
    count: function () { return items.length; }
  };
}

/* ---------- request ---------- */
function __urlObject(raw) {
  var u = { _raw: raw };
  u.toString = function () { return u._raw; };
  u.update = function (s) { u._raw = String(s); };
  u.getHost = function () { var m = /^(?:[a-z]+:\/\/)?([^\/?#:]+)/i.exec(u._raw); return m ? m[1] : ""; };
  u.getPath = function () { var m = /^(?:[a-z]+:\/\/)?[^\/?#]*([^?#]*)/i.exec(u._raw); return (m && m[1]) || "/"; };
  u.getQueryString = function () { var i = u._raw.indexOf("?"); return i < 0 ? "" : u._raw.slice(i + 1).split("#")[0]; };
  return u;
}
var __req = __input.request;
var __request = {
  id: __input.info.requestId,
  name: __input.info.requestName,
  method: __req.method,
  url: __urlObject(__req.url),
  headers: __headerList(__req.headers),
  body: { mode: __req.body.mode, raw: __req.body.raw, update: function (s) { this.raw = typeof s === "string" ? s : JSON.stringify(s); } }
};
__request.addHeader = function (h) { __request.headers.add(h); };
__request.removeHeader = function (k) { __request.headers.remove(k); };

/* ---------- response ---------- */
var __response = null;
if (__input.response) {
  var __res = __input.response;
  var __resHeaders = __headerList(__res.headers);
  __response = {
    code: __res.code,
    status: __res.status,
    headers: __resHeaders,
    responseTime: __res.responseTime,
    responseSize: __res.responseSize,
    text: function () { return __res.body; },
    json: function () { return JSON.parse(__res.body); }
  };
  var RP = Object.create(Assertion.prototype);
  function ResponseAssertion() { Assertion.call(this, __response); }
  ResponseAssertion.prototype = RP;
  RP.status = function (s) {
    var cond = typeof s === "number" ? __res.code === s : __res.status === s;
    return this._assert(cond, "expected response to have status " + __fmt(s) + " but got " + __res.code + " " + __res.status, "expected response not to have status " + __fmt(s));
  };
  RP.header = function (k, v) {
    var cond = arguments.length > 1 ? __resHeaders.has(k, v) : __resHeaders.has(k);
    return this._assert(cond, "expected response to have header " + __fmt(k) + (arguments.length > 1 ? " with value " + __fmt(v) : ""), "expected response to not have header " + __fmt(k));
  };
  RP.body = function (b) {
    var cond = arguments.length === 0 ? __res.body.length > 0 : (typeof b === "string" ? __res.body === b : __deepEqual(__response.json(), b));
    return this._assert(cond, "expected response body to match", "expected response body not to match");
  };
  RP.jsonBody = function (path, value) {
    var data;
    try { data = __response.json(); } catch (e) { return this._assert(false, "expected response body to be JSON", "expected response body not to be JSON"); }
    if (arguments.length === 0) return this._assert(true, "", "expected response body not to be JSON");
    var cur = data, parts = String(path).split("."), found = true;
    for (var i = 0; i < parts.length; i++) { if (cur !== null && typeof cur === "object" && parts[i] in cur) cur = cur[parts[i]]; else { found = false; break; } }
    var cond = found && (arguments.length < 2 || __deepEqual(cur, value));
    return this._assert(cond, "expected JSON body to have " + path + (arguments.length > 1 ? " = " + __fmt(value) : ""), "expected JSON body not to have " + path);
  };
  RP.responseTime = function (ms) { return this._assert(__res.responseTime <= ms, "expected response time <= " + ms + "ms (got " + __res.responseTime + ")", "expected response time > " + ms + "ms"); };
  function __codeGetter(name, test, label) { __getter(RP, name, function () { this._assert(test(__res.code), "expected response to be " + label + " but got " + __res.code, "expected response not to be " + label); }); }
  __codeGetter("ok", function (c) { return c >= 200 && c < 300; }, "2xx");
  __codeGetter("success", function (c) { return c >= 200 && c < 300; }, "2xx");
  __codeGetter("info", function (c) { return c >= 100 && c < 200; }, "1xx");
  __codeGetter("redirection", function (c) { return c >= 300 && c < 400; }, "3xx");
  __codeGetter("clientError", function (c) { return c >= 400 && c < 500; }, "4xx");
  __codeGetter("serverError", function (c) { return c >= 500; }, "5xx");
  __codeGetter("error", function (c) { return c >= 400; }, "4xx/5xx");
  __codeGetter("notFound", function (c) { return c === 404; }, "404");
  __codeGetter("unauthorized", function (c) { return c === 401; }, "401");
  __codeGetter("forbidden", function (c) { return c === 403; }, "403");
  __getter(RP, "json", function () {
    var ok = true; try { JSON.parse(__res.body); } catch (e) { ok = false; }
    this._assert(ok, "expected response body to be valid JSON", "expected response body not to be JSON");
  });
  Object.defineProperty(__response, "to", { get: function () { return new ResponseAssertion(); } });
}

/* ---------- pm ---------- */
var __env = __scope("environment");
__env.name = __input.environmentName || "";
var pm = {
  info: {
    eventName: __input.event,
    iteration: __input.info.iteration,
    iterationCount: __input.info.iterationCount,
    requestName: __input.info.requestName,
    requestId: __input.info.requestId
  },
  variables: __scope("local"),
  environment: __env,
  collectionVariables: __scope("collection"),
  globals: __scope("global"),
  iterationData: __scope("data", true),
  request: __request,
  response: __response,
  expect: function (v, msg) { return new Assertion(v, msg); },
  test: function (name, fn) {
    try {
      var r = fn();
      if (r && typeof r.then === "function") {
        var rec = { name: String(name), passed: true, error: null, skipped: false };
        __out.tests.push(rec);
        r.then(null, function (e) { rec.passed = false; rec.error = (e && e.message) || String(e); });
      } else {
        __out.tests.push({ name: String(name), passed: true, error: null, skipped: false });
      }
    } catch (e) {
      __out.tests.push({ name: String(name), passed: false, error: (e && e.message) || String(e), skipped: false });
    }
  },
  execution: {
    setNextRequest: function (n) { __out.nextRequest = n === null ? null : String(n); },
    skipRequest: function () { __out.skipRequest = true; },
    location: __input.info.location || []
  },
  visualizer: {
    set: function (template, data, options) { __out.visualizer = { template: String(template), data: data === undefined ? null : data, options: options || null }; },
    clear: function () { __out.visualizer = null; }
  },
  setNextRequest: function (n) { __out.nextRequest = n === null ? null : String(n); }
};
// pm.variables.get() resolves across every scope, like Postman.
pm.variables.get = function (k) { return __lookup(k); };
pm.variables.has = function (k) { return __lookup(k) !== undefined; };
pm.variables.toObject = function () {
  var o = {};
  for (var i = __ORDER.length - 1; i >= 0; i--) { var s = __out.variables[__ORDER[i]]; Object.keys(s).forEach(function (k) { o[k] = s[k]; }); }
  return o;
};
pm.test.skip = function (name) { __out.tests.push({ name: String(name), passed: true, error: null, skipped: true }); };
var pk = pm;

/* ---------- legacy Postman sandbox globals ---------- */
var tests = {};
var postman = {
  setEnvironmentVariable: function (k, v) { __env.set(k, v); },
  getEnvironmentVariable: function (k) { return __env.get(k); },
  clearEnvironmentVariable: function (k) { __env.unset(k); },
  setGlobalVariable: function (k, v) { pm.globals.set(k, v); },
  getGlobalVariable: function (k) { return pm.globals.get(k); },
  clearGlobalVariable: function (k) { pm.globals.unset(k); },
  setNextRequest: pm.setNextRequest
};
var environment = __out.variables.environment;
var globals = __out.variables.global;
var request = { url: __req.url, method: __req.method, headers: __request.headers.toObject(), data: __req.body.raw, name: __input.info.requestName };
var responseBody = __input.response ? __input.response.body : undefined;
var responseCode = __input.response ? { code: __input.response.code, name: __input.response.status } : undefined;
var responseTime = __input.response ? __input.response.responseTime : undefined;
var responseHeaders = __input.response ? __response.headers.toObject() : undefined;
`;

/** Evaluated after the user script to serialize results back to the host. */
export const EPILOGUE = String.raw`
(function () {
  Object.keys(tests).forEach(function (name) {
    __out.tests.push({ name: name, passed: !!tests[name], error: tests[name] ? null : "tests[\"" + name + "\"] bernilai false", skipped: false });
  });
  __out.request = {
    method: String(__request.method || "GET").toUpperCase(),
    url: String(__request.url),
    headers: __request.headers._items.map(function (h) { return [h.key, h.value]; }),
    body: { mode: __request.body.mode, raw: __request.body.raw }
  };
  return JSON.stringify(__out);
})()
`;
