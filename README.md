# Azul Tech People

An HR document management system for Azul Tech. It can run two ways:

- **Locally on one computer** (the default) — the server only listens on `127.0.0.1`, so it can never be reached from another device or over the network.
- **Deployed to a server** (see [Deploying to a server](#deploying-to-a-server) below) — so HR/Admin staff can log in from more than one office computer. Access is still gated by login (Admin/HR/Employee roles) exactly as described below; deploying doesn't loosen who can see what, it just means the login page is reachable from more than one PC.

## Access model

- **Admin** — manages user accounts (create/disable HR & Admin logins), plus everything HR can do, plus the audit log.
- **HR** — manages employee records and all documents (contracts, ID copies, letters, certificates, other).
- **Employee** — can log in to see their own basic profile only. Employees do **not** have access to any documents — those are HR/Admin only, by design.

All documents are encrypted at rest (AES-256-GCM) on disk under `server/storage/` — the files there are ciphertext, not readable directly. Every login, upload, download, and delete is recorded in an audit log visible to Admins.

## First-time setup

1. Install dependencies:
   ```
   npm run install:all
   ```
2. Configure the server:
   - Copy `server/.env.example` to `server/.env`
   - Generate a JWT secret:
     ```
     node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
     ```
   - Generate an encryption key:
     ```
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```
   - Paste both values into `server/.env` as `JWT_SECRET` and `ENCRYPTION_KEY`.
   - **Back up the `ENCRYPTION_KEY` somewhere safe outside this folder.** If it's lost, every stored document becomes permanently unreadable — there is no recovery.
3. Create the first Admin account:
   ```
   npm run create-admin
   ```
4. Start the app:
   ```
   npm run dev
   ```
   Open **http://localhost:5173** in a browser on this computer. Log in with the Admin account you just created.

## Day-to-day use

- As Admin: go to **User Accounts** to create HR logins (and any Employee logins you want).
- As Admin or HR: go to **Employees** to add staff and open their record to upload/download/delete documents.
- Back up the whole `server/data/` (database) and `server/storage/` (encrypted documents) folders together, regularly — they only make sense as a pair, and both are useless without the `ENCRYPTION_KEY` in `.env`.

## Notes

- For **local single-machine use** (the default), this app is intentionally not exposed to the network — it binds to `127.0.0.1` only. Leave `HOST`/`NODE_ENV` unset in `server/.env` to keep that guarantee.
- There is no cloud backup built in. Since this holds sensitive personal data (IDs, contracts), keep backups encrypted and access-controlled the same way you would the original documents.

## Deploying to a server

This turns the app into a single web service: the Express server serves both the API and the built React app from one port, so it can sit behind whatever reverse proxy/HTTPS setup the hosting server already uses for its other apps.

**Before deploying:** since the server becomes reachable from the internet, it must be served over **HTTPS** — either the hosting platform terminates TLS for you (typical on a shared app host), or IT puts nginx/Traefik in front of it with a certificate (e.g. Let's Encrypt). Login still works exactly the same (email + password, Admin/HR/Employee roles); HTTPS just protects those credentials and documents in transit.

### Option A — Docker (recommended if their host supports it)

A `Dockerfile` is included at the project root. It builds the React app, then runs the Express server as a single container listening on port `4000`.

```
docker build -t azul-tech-hr .
docker run -d \
  -p 4000:4000 \
  -e JWT_SECRET=<generate a new one, see below> \
  -e ENCRYPTION_KEY=<generate a new one, see below> \
  -v hr-data:/app/server/data \
  -v hr-storage:/app/server/storage \
  azul-tech-hr
```

The two `-v` volumes are **required** — without them, every redeploy or container restart wipes all employees, users, and documents. Whatever hosting platform IT uses (Coolify, Railway, Render, plain Docker Compose, etc.), the two things to configure are: the environment variables below, and persistent volumes mounted at `/app/server/data` and `/app/server/storage`.

### Option B — Without Docker (Node directly on the server)

```
npm run install:all
npm run build              # builds client/dist
```
Then in `server/.env`, set:
```
NODE_ENV=production
HOST=0.0.0.0
PORT=4000
JWT_SECRET=<generate a new one>
ENCRYPTION_KEY=<generate a new one>
```
Generate both the same way as local setup (see above), and start it with a process manager that keeps it running and restarts it on crash/reboot — e.g. `pm2 start src/index.js --cwd server --name azul-tech-hr` or a systemd service. Running it with a bare `node src/index.js` in a terminal will stop the moment that terminal closes.

### After it's running (either option)

1. Whatever reverse proxy IT points at this app's port (`4000` by default) should terminate HTTPS and forward plain HTTP to it.
2. Run `npm run create-admin` once (Option B: directly on the server; Option A: `docker exec -it <container> node scripts/createAdmin.js`) to create the real first Admin login — don't reuse any admin password that's been shared in chat or elsewhere.
3. Set up a backup routine for the `hr-data`/`hr-storage` volumes (or `server/data`/`server/storage` folders in Option B) — ask IT if the shared host already has a backup policy that covers them, since this data (IDs, contracts) needs the same care as the physical documents would.
