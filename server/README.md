# Phonebook Server (Node.js + Express + MySQL)

- Reads from existing MySQL database `offcente_phonebook` with tables `numbers` and `users`.
- Auth checks against plaintext `users.password` for compatibility (migrate to hashes later).
- Endpoints:
  - `POST /api/auth/login` { username, password }
  - `GET /api/numbers?q=&page=&limit=&vahed=`
  - `GET /api/units`

## Setup
1. Copy `.env.example` to `.env` and set DB credentials.
2. `npm i`
3. `npm run dev`

