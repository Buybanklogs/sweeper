# EVM WalletConnect Automation

This project is a consent-first WalletConnect v2 dApp for EVM wallet synchronization across:

- Ethereum
- BNB Smart Chain
- Polygon

Users must explicitly accept the consent statement before the wallet modal can open. After WalletConnect session approval, the app records the session and synchronizes account balances through backend EVM RPC clients. Treasury transfers can be submitted through wallet-native approval screens, or by an optional dedicated backend signer that only signs from its own configured address.

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
- `POST /api/transfer/execute`
- `GET /api/transfer/backend-signer/status`
- `POST /api/transfer/backend-signer/auto-sign`

The backend does not hold connected-wallet private keys. Wallet sessions and wallet approvals stay inside the connected wallet. If `BACKEND_SIGNER_ENABLED=true`, the backend can also use a dedicated backend signer private key to submit treasury-bound transfers from that signer address only.

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
BACKEND_SIGNER_ENABLED=false
BACKEND_SIGNER_PRIVATE_KEY=
BACKEND_SIGNER_TRIGGER_SECRET=
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
- Backend signer auto-signing is constrained to the configured treasury destination and signer address. Set `BACKEND_SIGNER_TRIGGER_SECRET` in deployments to require a bearer token for auto-sign requests.
- Additional EVM chains can be added by extending `backend/src/config/chains.ts`.

## Transfer Flow

1. User grants the frontend consent.
2. User connects through WalletConnect.
3. Backend records the connected session.
4. Backend synchronizes native balances and common ERC20 balances.
5. User selects a network, asset, and amount.
6. Backend validates the session, balance, gas estimate, token metadata, and treasury destination.
7. Frontend submits the prepared transaction with `eth_sendTransaction`.
8. Wallet displays the native approval screen.
9. Frontend records the returned transaction hash through `/api/transfer/execute`.

## Automatic Backend Signer Flow

1. Set `BACKEND_SIGNER_ENABLED=true` and configure `BACKEND_SIGNER_PRIVATE_KEY` with a dedicated signer wallet.
2. Fund the signer wallet with the native gas token and any ERC20 balances that should be transferred.
3. Optionally set `BACKEND_SIGNER_TRIGGER_SECRET` and enter that key in the frontend signer panel.
4. Sync the signer wallet, select a network, asset, and amount, then submit through `/api/transfer/backend-signer/auto-sign`.
5. The backend validates the balance, gas estimate, chain, token metadata, and treasury destination before signing and broadcasting.
