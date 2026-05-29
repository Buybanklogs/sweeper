# EVM WalletConnect Automation

This project is a consent-first WalletConnect v2 dApp for EVM wallet synchronization across:

- Ethereum
- BNB Smart Chain
- Polygon

Users must explicitly accept the consent statement before the wallet modal can open. After WalletConnect session approval, the app records the session, synchronizes account balances through backend EVM RPC clients, and builds a reviewable transfer plan. The backend only prepares unsigned transaction requests; transfers are submitted through wallet-native approval screens.

## Architecture

```text
backend/
  src/
    blockchain/       EVM public clients
    config/           environment and supported chains
    controllers/      API controllers
    db/               Prisma client
    routes/           Express routes
    services/         wallet session and sync services
    utils/            shared helpers
frontend/
  index.html          consent-first WalletConnect UI
  app.js              WalletConnect v2 browser flow
  style.css           responsive interface styles
```

## Backend

Stack:

- Node.js
- TypeScript
- Express
- Prisma
- PostgreSQL
- viem

Endpoints:

- `GET /api/health`
- `GET /api/wallet/config`
- `POST /api/wallet/session`
- `POST /api/wallet/sync`
- `POST /api/transfer/prepare`
- `POST /api/transfer/prepare-all`
- `POST /api/transfer/execute`

The backend does not hold connected-wallet private keys. Wallet sessions and wallet approvals stay inside the connected wallet. `/api/transfer/prepare-all` returns unsigned transaction requests only.

## Frontend

The frontend uses WalletConnect v2 through `@walletconnect/ethereum-provider` and supports WalletConnect-compatible wallets such as:

- Trust Wallet
- Bitget Wallet
- MetaMask
- OKX Wallet
- TokenPocket
- SafePal

The Connect Wallet button remains disabled until the required consent checkbox is selected.

## Environment

Create `backend/.env` from `backend/.env.example`:

```env
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/evm_walletconnect?schema=public
WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
TREASURY_EVM_ADDRESS=0xYourTreasuryWallet
ETH_RPC_URL=https://your-ethereum-rpc
BSC_RPC_URL=https://your-bsc-rpc
POLYGON_RPC_URL=https://your-polygon-rpc
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
SYNC_SUPPORTED_CHAINS=1,56,137
```

## Local Setup

```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:dev
npm run dev
```

Serve `frontend/` as static files, then set the Backend URL field to your API origin.

## Deployment

Railway backend:

1. Create a PostgreSQL database.
2. Deploy the `backend` directory.
3. Add the environment variables above.
4. Build command:

```bash
npm install && npm run prisma:generate && npm run build
```

5. Start command:

```bash
npm run prisma:migrate && npm start
```

Vercel frontend:

1. Deploy the `frontend` directory as a static project.
2. Enter the Railway API URL in the Backend URL field.
3. Add the Vercel domain to `CORS_ORIGIN`.

## Notes

- WalletConnect project IDs are public client identifiers, but keep deployment configuration in environment variables.
- Connected-wallet transaction requests are initiated through wallet-native approval screens; the backend only prepares and records them.
- Additional EVM chains can be added by extending `backend/src/config/chains.ts`.

## Transfer Flow

1. User grants the frontend consent.
2. User connects through WalletConnect.
3. Backend records the connected session.
4. Backend synchronizes native balances and common ERC20 balances.
5. App builds a visible transfer plan with network, asset, detected balance, estimated gas, and destination EVM address.
6. User clicks `Review Transfers`.
7. Frontend calls `/api/transfer/prepare-all`.
8. Backend validates the session, balances, gas estimates, token metadata, and treasury destination, then returns unsigned transaction requests only.
9. User clicks `Approve Transfers`.
10. Frontend submits each unsigned request with `eth_sendTransaction`.
11. Wallet displays native approval screens for each transaction.
12. Frontend records each returned transaction hash through `/api/transfer/execute`.
