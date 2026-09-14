// Azul Tech SSO (Keycloak) client for the optional "Continue with Azul Tech
// SSO" login. Pinned to openid-client v5 (not the newer v6 line) because
// this server is CommonJS end-to-end and v6 is ESM-only — see server/package.json.
//
// SSO is entirely optional: if the four KEYCLOAK_* env vars aren't set,
// ssoEnabled() is false and routes/auth.js skips registering the SSO routes
// (or returns 404 for them), so a server with no Keycloak configured behaves
// exactly as it did before this file existed.
const { Issuer } = require('openid-client');

function ssoEnabled() {
  return Boolean(
    process.env.KEYCLOAK_ISSUER &&
      process.env.KEYCLOAK_CLIENT_ID &&
      process.env.KEYCLOAK_CLIENT_SECRET &&
      process.env.KEYCLOAK_REDIRECT_URI
  );
}

let clientPromise = null;

// Discovers the realm's OIDC configuration once (network call to Keycloak)
// and reuses the resulting client for the life of the process. Deliberately
// lazy — done on the first SSO request, not at server boot — so a Keycloak
// that's temporarily down never stops HRM's own password login from working.
//
// KEYCLOAK_SERVER_URL: When running inside Docker, "localhost" inside the
// container is itself — so we need a different URL to *reach* Keycloak
// (e.g. http://host.docker.internal:8081 or the container name). This env
// var is used only for the network call to discover OIDC endpoints. Token
// verification still uses KEYCLOAK_ISSUER, which must match what Keycloak
// actually puts in the "iss" claim of issued tokens (typically the
// KC_HOSTNAME_URL, i.e. http://localhost:8081/...).
function getClient() {
  if (!ssoEnabled()) return Promise.reject(new Error('SSO is not configured'));
  if (!clientPromise) {
    clientPromise = (async () => {
      const issuerUrl = process.env.KEYCLOAK_ISSUER;
      const serverUrl = process.env.KEYCLOAK_SERVER_URL || issuerUrl;

      try {
        // Normal path: discovery from the issuer URL works (both on the host,
        // or KEYCLOAK_SERVER_URL isn't set and server == issuer).
        if (serverUrl === issuerUrl) {
          const issuer = await Issuer.discover(issuerUrl);
          return new issuer.Client({
            client_id: process.env.KEYCLOAK_CLIENT_ID,
            client_secret: process.env.KEYCLOAK_CLIENT_SECRET,
            redirect_uris: [process.env.KEYCLOAK_REDIRECT_URI],
            response_types: ['code'],
          });
        }

        // Docker path: serverUrl ≠ issuerUrl.  openid-client's Issuer.discover
        // would reject the response because the OIDC config's "issuer" field
        // (http://localhost:8081/...) doesn't match the URL we asked
        // (host.docker.internal:8081/...).  So we fetch the config ourselves
        // and construct the Issuer manually.
        const wellKnownUrl = `${serverUrl}/.well-known/openid-configuration`;
        const resp = await fetch(wellKnownUrl);
        if (!resp.ok) throw new Error(`OIDC discovery failed: ${resp.status}`);
        const config = await resp.json();

        // config.issuer is the real issuer Keycloak signs tokens with
        // (e.g. http://localhost:8081/realms/azultech).
        // The endpoint URLs in config.* are rooted at that issuer URL,
        // which we CAN'T reach from inside Docker (localhost = ourselves).
        // Rewrite them to use serverUrl so the HTTP calls actually work.
        const rewriteBase = (url) =>
          url?.replace(config.issuer, serverUrl);

        const issuer = new Issuer({
          issuer: config.issuer,
          authorization_endpoint: rewriteBase(config.authorization_endpoint),
          token_endpoint: rewriteBase(config.token_endpoint),
          userinfo_endpoint: rewriteBase(config.userinfo_endpoint),
          jwks_uri: rewriteBase(config.jwks_uri),
        });

        return new issuer.Client({
          client_id: process.env.KEYCLOAK_CLIENT_ID,
          client_secret: process.env.KEYCLOAK_CLIENT_SECRET,
          redirect_uris: [process.env.KEYCLOAK_REDIRECT_URI],
          response_types: ['code'],
        });
      } catch (discoveryErr) {
        // If everything fails, don't cache — let the next request retry.
        throw discoveryErr;
      }
    })();
    // Don't cache a failed discovery attempt — let the next request retry
    // instead of every SSO login failing until the process restarts.
    clientPromise.catch(() => {
      clientPromise = null;
    });
  }
  return clientPromise;
}

module.exports = { ssoEnabled, getClient };
