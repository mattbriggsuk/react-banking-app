# bankingWizz

A React and TypeScript frontend designed to work with compatible backend Banking API implementations.

<img width="1276" height="863" alt="image" src="https://github.com/user-attachments/assets/3d1acbdc-1ada-49a4-8143-66823f2dcd07" />

## Run locally

Use Node.js 22.12+ or 24. Dependencies are installed; use `npm ci` on a fresh checkout.

Start a compatible banking API on `http://localhost:8080`. Follow the build and run instructions in the repository for the backend implementation you want to use.

In a second terminal:

```powershell
cd react-banking-app
npm run dev
```
d
Open the URL printed by Vite, normally `http://127.0.0.1:5173`. The frontend proxies `/api` to `http://localhost:8080`, so local development needs no API CORS change. Run one backend implementation on that port at a time.

## Customer and account flow

- **New customer:** enter a first name, last name and email address. The API generates a six-digit PIN and creates an authenticated session. A registration dialog shows the customer number and PIN. The PIN starts hidden on the account page and can be shown with **Reveal PIN**.
- **Existing customer:** choose customer number or email address, then enter the six-digit PIN. Customer-number spaces are removed by the frontend and email matching is case-insensitive.
- **Accounts:** view each account's number, type, balance and open or closed state. Select an account to deposit, withdraw, transfer or close it.
- **Transfer:** choose another open account or enter an account number manually. Transfers may be sent to an account belonging to another customer.
- **Close Account:** requires a zero balance and explicit confirmation. Closed accounts remain visible and cannot receive further transactions.
- **Open Account:** choose Current, Savings or Credit. The authenticated session determines which customer owns the new account.
- **Logout:** revokes the current API session and clears the displayed PIN and session token.

The PIN and session token are held only in memory and are cleared by a page reload. After login, **Reveal PIN** displays the PIN entered for the current session.

Balances are displayed as GBP. Amounts are sent as decimal strings to preserve the entered value without introducing client-side floating-point rounding. The UI accepts positive amounts with at most two decimal places and prevents withdrawals above the displayed balance. The API remains responsible for enforcing balances, ownership and account state.

Account types currently share the same balance rules. Interest, overdrafts and credit limits are outside the current API contract.

## API contract

Any backend implementation can be used when it provides the following routes, request and response shapes, status codes, and bearer-session behavior.

| Action | Endpoint | Request |
| --- | --- | --- |
| Register | `POST /api/customer/register` | `{ "customer": { "firstName", "lastName", "email" } }` |
| Log in | `POST /api/access/login` | `{ "identifier": "customer number or email", "pin": "012345" }` |
| Log out | `POST /api/access/logout` | Empty JSON object |
| Find customer | `GET /api/customer/get` | `?customerNumber=...` |
| List accounts | `GET /api/customer/accounts` | `?customerNumber=...` |
| Open | `POST /api/account/create` | `{ "accountType": "CURRENT" / "SAVINGS" / "CREDIT" }` |
| Close | `POST /api/account/close` | `{ "accountNumber" }` |
| Deposit / withdraw | `POST /api/account/deposit` or `/withdraw` | `{ "transaction": { "transactionType": "DEPOSIT" / "WITHDRAWAL", "amount", "targetAccountNumber" } }` |
| Transfer | `POST /api/account/transfer` | `{ "transaction": { "transactionType": "TRANSFER", "amount", "sourceAccountNumber", "targetAccountNumber" } }` |

Registration returns:

```json
{
  "customer": {
    "customerNumber": "1234567890123452",
    "firstName": "Alex",
    "lastName": "Morgan",
    "email": "alex@example.com"
  },
  "pin": "012345",
  "sessionToken": "opaque-session-token"
}
```

Login returns the same `customer` and `sessionToken` fields without the PIN. The frontend sends the token on protected requests:

```http
Authorization: Bearer opaque-session-token
```

Every account response includes `accountNumber`, `customerNumber`, `balance`, `closed` and `accountType`. Account creation derives the customer from the authenticated session, so the request does not contain a customer number. Account actions verify ownership of the account being changed; a transfer can credit another customer's account.

Successful logout returns HTTP 204. Expected API failures use `application/problem+json`, with a user-facing message in the `detail` field. An expired or invalid session returns HTTP 401, and an ownership failure returns HTTP 403.

## Configuration and deployment

Copy `.env.example` to `.env.local` if needed, then restart Vite:

```dotenv
API_PROXY_TARGET=http://localhost:8080
VITE_API_BASE_URL=
```

`API_PROXY_TARGET` selects the backend used by the development and local preview proxy. Leave `VITE_API_BASE_URL` empty to make requests through `/api` on the frontend origin.

For production, either route `/api` to a compatible backend through a same-origin reverse proxy or set `VITE_API_BASE_URL` to the backend origin. A separate backend origin must allow the frontend origin through CORS.

`npm run build` creates static assets in `dist/`. The Vite proxy is available only during development and local preview.

## Verification

```powershell
npm test
npm run build
```

The frontend tests cover registration, PIN display, login by customer number or email, bearer authentication, session expiry, logout, account creation, transaction request formats, transfers, balance refresh, account closure and API error messages.
