# CodeAgent Provider Design

## Overview

CodeAgent is a first-class model provider with `provider = "codeagent"`.
Its OAuth client parameters and password-login endpoint are fixed by the backend.
Its inference endpoint defaults to the built-in CodeAgent URL, but profiles may
store a custom CodeAgent-compatible `base_url`.
The user does not configure a separate CodeAgent login URL.

CodeAgent profile auth always lives under `codeagent_auth`.
There are two supported auth modes:

- `sso`: CodeAgent OAuth / refresh-token flow
- `password`: username/password login that reuses the MaaS secure-login endpoint and payload contract

## Endpoint And OAuth Constants

The backend enforces these OAuth/login constants and default endpoint:

| Name | Value |
| --- | --- |
| `DEFAULT_CODEAGENT_BASE_URL` | `https://codeagentcli.rnd.huawei.com/codeAgentPro` |
| `DEFAULT_CODEAGENT_SSO_BASE_URL` | `https://ssoproxysvr.cd-cloud-ssoproxysvr.szv.dragon.tools.huawei.com/ssoproxysvr` |
| `DEFAULT_CODEAGENT_CLIENT_ID` | `com.huawei.devmind.codebot.apibot` |
| `DEFAULT_CODEAGENT_SCOPE` | `1000:1002` |
| `DEFAULT_CODEAGENT_SCOPE_RESOURCE` | `devuc` |

CodeAgent profiles use `DEFAULT_CODEAGENT_BASE_URL` when `base_url` is omitted
or blank. A configured CodeAgent profile `base_url` is otherwise preserved
through save, reload, probe, discovery, and runtime execution.
`CodeAgentAuthConfig` also enforces the fixed OAuth client values even if callers submit different ones.

For password auth, the backend reuses the MaaS secure-login endpoint and request/response shape:

- `POST http://rnd-idea-api.huawei.com/ideaclientservice/login/v4/secureLogin`
- request headers include `app-id: RelayTeams`

The returned token is then used as the CodeAgent `X-Auth-Token`.

## Auth Modes

### SSO Mode

`codeagent_auth.auth_method = "sso"` uses the existing OAuth flow:

- `POST /api/system/configs/model/codeagent/oauth:start`
- `GET /api/system/configs/model/codeagent/oauth/{auth_session_id}`

The frontend starts OAuth, opens the returned authorization URL, and polls for completion.
Completed OAuth sessions yield CodeAgent `access_token` and `refresh_token`.
The start request accepts optional `base_url`; the frontend sends the current
draft effective CodeAgent endpoint, falling back to the built-in default when
the field is blank.
Saving an OAuth session into a profile requires the session `base_url` to match
the profile's effective CodeAgent `base_url`, so default-endpoint tokens are
not stored for custom CodeAgent-compatible endpoints.

At runtime:

- the current `access_token` is used first when present
- `401` or `403` triggers one refresh attempt through `refresh_token`
- refreshed tokens are persisted back to the secret store

### Password Mode

`codeagent_auth.auth_method = "password"` requires:

- `username`
- `password`

The login exchange does not use OAuth sessions or refresh tokens.
Instead, the CodeAgent token service logs in with the MaaS-compatible secure-login API and caches the returned token for a short TTL.
Password mode may use the shared W3 connector as its credential source only
when the effective CodeAgent `base_url` is `DEFAULT_CODEAGENT_BASE_URL`; custom
CodeAgent-compatible endpoints must use profile-local credentials or SSO.

At runtime:

- if no cached token is available, the provider logs in with the saved username/password
- if a CodeAgent request returns `401` or `403`, the provider logs in again and retries once
- password-mode tokens are not persisted as refreshable CodeAgent credentials

## Persisted Profile Shape

Saved CodeAgent profiles keep auth state in `codeagent_auth`.
The backend never stores raw CodeAgent password credentials or OAuth tokens in `model.json`.

### Stored SSO Profile

```json
{
  "provider": "codeagent",
  "model": "codeagent-chat",
  "base_url": "https://codeagentcli.rnd.huawei.com/codeAgentPro",
  "codeagent_auth": {
    "auth_method": "sso",
    "has_access_token": true,
    "has_refresh_token": true
  }
}
```

### Stored Password Profile

```json
{
  "provider": "codeagent",
  "model": "codeagent-chat",
  "base_url": "https://codeagentcli.rnd.huawei.com/codeAgentPro",
  "codeagent_auth": {
    "auth_method": "password",
    "username": "relay-user",
    "has_password": true
  }
}
```

Persistence rules:

- SSO `access_token` and `refresh_token` are stored in the unified secret store.
- Password-mode `password` is stored in the unified secret store.
- Profile-local CodeAgent secrets are stored with a normalized endpoint binding.
- Password-mode `username` stays in the profile JSON.
- Editing a saved password profile with an empty password field preserves the stored password secret.
- Switching from SSO to password removes saved SSO tokens.
- Switching from password to SSO removes the saved password secret.

## Runtime Config Resolution

Runtime profile loading resolves `codeagent_auth` differently by mode:

- `sso`: requires a saved `refresh_token` or an in-progress `oauth_session_id`
- `password`: requires `username` plus a password from the secret store or inline override

This keeps `codeagent_auth` as the single CodeAgent auth contract.
CodeAgent does not reuse top-level `maas_auth`.
Runtime rejects keyring-backed profile-local CodeAgent secrets when their saved
endpoint binding is missing for a custom endpoint or differs from the profile's
effective `base_url`.

## Model Discovery And Chat Requests

CodeAgent model discovery and chat requests use the same provider auth resolver as save-time verification and runtime execution.
When a draft request changes `base_url` from a saved CodeAgent profile, saved
profile credentials are not reused; the draft must include complete auth for
the target endpoint.
W3 credential references are rejected when the effective CodeAgent endpoint is
not the built-in default, because W3 credentials are shared connector secrets
and are not bound to custom CodeAgent-compatible endpoints.
Token polling, refresh, password login, request auth, model discovery, chat
probe, and auth verification are async-only backend paths. CodeAgent provider
code must use the shared async HTTP client and `httpx.Auth.async_auth_flow`;
there is no separate sync token or sync auth-flow implementation.

### Model Discovery

- `GET {base_url}/chat/modles?checkUserPermission=TRUE`

Required request headers:

| Header | Value |
| --- | --- |
| `X-Auth-Token` | resolved CodeAgent token |
| `app-id` | `com.huawei.devmind.codebot.apibot` |
| `User-Agent` | `RelayAgent/1.0` |
| `gray` | `true` |
| `plugin-version` | `cli-1.2605.02-IN.1.` |

The discovery parser accepts a bare JSON list or objects with `data` / `models`.
Model ids are normalized from `name`, `id`, or `model` and deduplicated.

### Chat

- `POST {base_url}/chat/completions`

Required request headers:

| Header | Value |
| --- | --- |
| `X-Auth-Token` | resolved CodeAgent token |
| `app-id` | `com.huawei.devmind.codebot.apibot` |
| `Content-Type` | `application/json` |
| `Accept` | `text/event-stream` |
| `User-Agent` | `AgentKernel/1.0` |
| `gray` | `false` |
| `oc-heartbeat` | `1` |
| `X-snap-traceid` | generated UUID |
| `X-session-id` | generated `ses_...` id |

The provider strips any preexisting OpenAI `Authorization`, `X-Auth-Token`, and CodeAgent-specific headers before injecting the resolved CodeAgent headers.

## Frontend Behavior

When the user selects `codeagent` in Settings:

- the UI hides API-key auth
- the UI shows an auth-method selector
- `sso` shows the existing SSO button and status
- `password` shows username and password inputs

The draft flow is:

1. select `CodeAgent`
2. choose `SSO` or `Username and Password`
3. either complete SSO or enter username/password
4. fetch the model list using the resolved CodeAgent token

For saved password profiles, the password field remains masked by default and the UI preserves the stored secret unless the user enters a new password.

## Auth Verification API

The settings page uses:

- `POST /api/system/configs/model/codeagent/auth:verify`

The request body only includes the saved profile name.
The backend validates the saved CodeAgent auth state for either mode:

- `status = "valid"`: the profile can still obtain or use a CodeAgent token
- `status = "reauth_required"`: SSO refresh failed or password re-login failed with an auth-invalid result
- `status = "error"`: transport or upstream failure prevented verification

This endpoint distinguishes “saved credentials exist” from “the credentials were verified successfully right now”.

## Validation Notes

- CodeAgent profiles always require `codeagent_auth`.
- `sso` mode requires a saved refresh path or OAuth session id.
- `password` mode requires `username` and `password` for new drafts.
- The backend defaults to the default CodeAgent inference base URL, but
  custom CodeAgent-compatible `base_url` values are preserved.
- `auth_source = "w3"` is allowed only with the default CodeAgent inference
  base URL.
- Runtime-loaded CodeAgent W3 profiles with custom endpoints are skipped before
  shared W3 credentials are resolved.
- Password login is a CodeAgent-only auth mode even though it reuses the MaaS login endpoint.
