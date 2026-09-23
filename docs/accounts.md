# Accounts, and signing in with Google or GitHub

Vizroute has three ways in, and which ones appear depends entirely on how the
deployment is configured.

| Way in | Needs | Shown when |
| --- | --- | --- |
| Email and password | Nothing, or Supabase | Always |
| Continue with Google | Supabase + Google enabled | Supabase is configured |
| Continue with GitHub | Supabase + GitHub enabled | Supabase is configured |

With no Supabase keys the app keeps accounts in the browser (PBKDF2 through
WebCrypto, nothing leaves the tab) and says so on the page. The Google and
GitHub buttons are **not rendered at all** in that mode — there is nobody to
redirect to, and a button that cannot work is worse than no button.

The API Map needs no account at any point. Contract Graph does, because an
estate has to belong to someone.

## Connecting Supabase

Project Settings → API gives you two values. Both go in `.env.local` for
development, and in the host's environment for a deployed build:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<the anon / public key>
```

The anon key is meant for browsers. The `service_role` key is not — it must
never appear in a `VITE_*` variable, because Vite inlines those into the
bundle it ships.

## Switching Google and GitHub on

Until a provider is enabled in the Supabase dashboard, clicking its button
answers on the page with *"That sign-in option is not switched on for this
site yet."* — the app asks the service before it sends anyone anywhere, so
nobody lands on a raw JSON error.

**In Supabase**, once per provider: Authentication → Providers → enable it,
and paste in the client id and secret from below. The page shows the
**callback URL** to register with the provider; it is always

```
https://<project>.supabase.co/auth/v1/callback
```

**In Google Cloud** (console.cloud.google.com): APIs & Services →
Credentials → Create credentials → OAuth client ID → Web application. Add the
Supabase callback URL above under *Authorised redirect URIs*. Copy the client
id and secret into Supabase. A new project also needs an OAuth consent screen
before the client will work.

**In GitHub** (Settings → Developer settings → OAuth Apps → New OAuth App):
set the homepage to your site and the *Authorization callback URL* to the
Supabase callback URL above. Generate a client secret, and copy both into
Supabase.

## The addresses Supabase needs to know

Authentication → URL Configuration:

- **Site URL** — where the app is served from, e.g. `https://vizroute.app`.
  This is where a provider sends the browser back to.
- **Redirect URLs** — add each origin the app runs on that is not the Site
  URL, such as `http://localhost:5173/` for development.

The app always asks to come back to the **site root**, never to a deeper
path. That is deliberate: the root is the one address a static host serves
without a rewrite rule, and it is Supabase's own default, so nothing extra
has to be allow-listed. Where the person was actually going is kept in this
tab's `sessionStorage` for the length of the round trip, and only ever as a
path on this site — a full URL there would make `?next=` an open redirect.

## What the round trip does

1. The button asks the service whether the provider is enabled. If not, the
   message appears on the form and the browser stays put.
2. The destination is stashed for this tab, and the browser leaves for
   `/auth/v1/authorize?provider=…&redirect_to=<site root>`.
3. The provider sends it back to the root with tokens in the URL fragment.
4. Before any page reads that fragment, the app exchanges the token for the
   account it belongs to, stores the session, takes the tokens out of the
   address bar, and loads the page the person was going to.
5. A refusal — cancelled, or a provider that was switched off mid-flight —
   comes back as a message on the sign-in form instead.

Anything a visitor mapped before signing in is claimed by the new account on
the way past, so a Contract Graph estate built without one is not orphaned.

## Where a session lives

A small object in `localStorage`, or in `sessionStorage` when *Keep me signed
in* was unticked, in which case it ends with the tab. Signing out clears both
and, with Supabase, tells the service too. The choice survives the round trip:
untick the box, sign in with Google, and the session still ends with the tab.
