// Process instrumentation for the isolated lab ONLY. Upstream files unchanged.
import https from 'node:https';
import http from 'node:http';
import { syncBuiltinESMExports } from 'node:module';
import { randomBytes, generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
if (process.argv[1]?.endsWith('server.js')) {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  process.env.GH_MERGE_TOKEN = randomBytes(32).toString('hex');
  process.env.MCP_API_KEY = randomBytes(32).toString('hex');
  process.env.GSC_SERVICE_ACCOUNT_JSON = JSON.stringify({ type: 'service_account', project_id: 'gabi-lab-only', client_email: 'synthetic@site-a.example', private_key: privateKey });
  writeFileSync('/tmp/gabi-fault-context.json', JSON.stringify({ legacyToken: process.env.MCP_API_KEY }), { mode: 0o600 });
  function mapped(raw) {
    const url = new URL(raw);
    if (url.hostname === 'api.github.com') return `http://faults:8080/provider/github${url.pathname}${url.search}`;
    if (['www.googleapis.com','oauth2.googleapis.com','searchconsole.googleapis.com'].includes(url.hostname)) return `http://faults:8080/provider/google${url.pathname}${url.search}`;
    return null;
  }
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const target = mapped(input instanceof Request ? input.url : String(input));
    return nativeFetch(target ? (input instanceof Request ? new Request(target, input) : target) : input, init);
  };
  const nativeRequest = https.request;
  https.request = function(input, options, callback) {
    let opts; let cb;
    if (typeof input === 'string' || input instanceof URL) {
      const u = new URL(input); opts = { protocol: u.protocol, hostname: u.hostname, port: u.port, path: u.pathname + u.search, ...(typeof options === 'object' ? options : {}) }; cb = typeof options === 'function' ? options : callback;
    } else { opts = { ...input }; cb = options; }
    const target = mapped(`https://${opts.hostname ?? opts.host}${opts.path ?? '/'}`);
    if (!target) return nativeRequest.call(this, input, options, callback);
    const u = new URL(target);
    delete opts.agent; delete opts.servername; delete opts.host;
    return http.request({ ...opts, protocol: 'http:', hostname: u.hostname, port: u.port, path: u.pathname + u.search }, cb);
  };
  syncBuiltinESMExports();
}
