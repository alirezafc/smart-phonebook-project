# Smart Phonebook Project

A web-based internal phonebook application with click-to-call functionality, built for office environments using Asterisk/Issabel PBX.

## Features — Version 1

- **Phonebook Management** — View, search, and filter contacts by name or department
- **Click-to-Call** — Click a button to initiate a call directly from the phonebook
- **Auto-Answer** — Phone automatically goes on speaker and dials the target number (Fanvil/ZTE/Grandstream)
- **DTMF Verification** — Two-phase extension verification using phone keypad code entry
- **Extension Locking** — Each desk extension is bound to one computer via IP address
- **Unit/Department Filtering** — Filter contacts by department
- **Persian Search** — Supports Persian digit normalization and flexible search
- **Admin Panel** — Add, edit, and delete phonebook entries (login required)

## Features — Version 2 (Planned)

- **Full Admin Dashboard** — User management (add/edit/delete users)
- **Issabel/Elastix Integration** — Direct server management and sync
- **Admin Password Management** — Secure password change and reset
- **Bulk Import/Export** — CSV/Excel import and export of contacts
- **Call History** — Log and view call records
- **Extension Management** — Admin overview of all claimed extensions

## Tech Stack

- **Frontend** — React, Vite, Tailwind CSS
- **Backend** — Node.js, Express.js
- **Database** — MySQL (MariaDB)
- **PBX** — Asterisk/Issabel (AMI integration)
- **Auth** — JWT (JSON Web Tokens)

## Project Structure

```
phonebook_node_react/
├── client/          # React frontend (Vite + Tailwind)
│   └── src/
│       ├── components/   # UI components
│       ├── pages/        # Page components (App, Login)
│       └── api.js        # Axios instance
├── server/          # Express backend
│   └── src/
│       ├── routes/
│       │   ├── call.js       # Call/verify/release logic (AMI)
│       │   └── numbers.js    # CRUD for phonebook entries
│       └── server.js         # Main server entry point
└── README.md
```

## Setup

### Server

```bash
cd server
cp .env.example .env   # Configure your settings
npm install
npm run dev
```

### Client

```bash
cd client
npm install
npm run dev
```

### Environment Variables (server/.env)

| Variable | Description | Default |
|---|---|---|
| `PORT` | Server port | 5000 |
| `MYSQL_HOST` | MySQL host | localhost |
| `MYSQL_PORT` | MySQL port | 3306 |
| `MYSQL_USER` | MySQL user | root |
| `MYSQL_PASSWORD` | MySQL password | — |
| `MYSQL_DATABASE` | Database name | offcente_phonebook |
| `JWT_SECRET` | JWT secret key | change_this_secret |
| `AMI_HOST` | Asterisk/Issabel IP | — |
| `AMI_PORT` | AMI port | 5038 |
| `AMI_USER` | AMI username | click2call |
| `AMI_PASS` | AMI password | — |
| `AMI_CHANNEL_TECH` | SIP or PJSIP | SIP |
| `OUTSIDE_PREFIX` | Outside dial prefix | 9 |
| `AUTO_ANSWER` | Auto-answer calls | 1 |

## Network Access

The app is designed for LAN use. After starting:

- Client: `http://<server-ip>:5173`
- Server API: `http://<server-ip>:5000`

Vite is configured with `host: true` for network access.

## License

Internal use only.
