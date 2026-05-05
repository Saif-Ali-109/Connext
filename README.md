# Wallet Chat Monorepo

This monorepo contains the codebase for a secure, decentralized chat application where users connect their cryptocurrency wallets for authentication and communication. The application is built with a Next.js frontend (web and mobile via Capacitor), an Express/Node.js backend, and interacts with smart contracts on the Ethereum Sepolia network.

## 1. PROJECT OVERVIEW

### What this app does in simple terms
Wallet Chat is an end-to-end encrypted chat application that leverages blockchain technology for user authentication and identity management. Users sign messages with their cryptocurrency wallets to prove ownership, register public encryption keys on-chain, and exchange secure messages. It supports both EVM-compatible and Solana wallets, allowing users to connect and chat securely across different blockchain ecosystems. Media sharing is facilitated through pre-signed Cloudflare R2 URLs.

### Tech Stack Used

#### Monorepo Root
*   `npm`: Package manager
*   `rimraf`: A `rm -rf` utility for Node.js
*   `ts-node`: TypeScript execution environment for Node.js
*   `typescript`: TypeScript language
*   `events`: Node.js Event Emitter (dependency of `ox`)
*   `ox`: (Version 0.14.20) - Used for what appears to be core utilities or a framework, heavily overridden in the root `package.json`.

#### `apps/server` (Backend - Express/Node.js)
*   **Language**: TypeScript
*   **Framework**: Express
*   **Database**: MongoDB (via Mongoose ORM)
*   **Authentication**: JSON Web Tokens (JWT), Nacl (for Solana signatures), Ethers (for EVM signatures)
*   **Real-time Communication**: Socket.IO
*   **Cloud Storage**: AWS SDK (S3 client for Cloudflare R2)
*   **Push Notifications**: Firebase Admin SDK (FCM)
*   **Security**: Helmet, Compression, Express Rate Limit
*   **Logging**: Morgan
*   **Utilities**: `bs58`, `dotenv`, `jsonwebtoken`, `multer`, `uuid`, `@types/*` for TypeScript definitions.
*   **Blockchain Interaction**: `ethers`, `@nomicfoundation/hardhat-verify`, `@nomicfoundation/ignition-core`, `@solana/web3.js`, `@wagmi/connectors`. (Note: `@solana/web3.js`, `@wagmi/connectors` seem to be unused here as direct dependencies, primarily client-side usage).

#### `apps/web` (Frontend - Next.js/React)
*   **Language**: TypeScript
*   **Framework**: Next.js, React
*   **Styling**: Tailwind CSS, PostCSS, Autoprefixer
*   **Web3 Libraries**:
    *   `wagmi`: Ethereum hooks
    *   `viem`: Low-level Ethereum interface
    *   `@web3modal/wagmi`: WalletConnect integration
    *   `@capacitor/android`, `@capacitor/cli`, `@capacitor/core`: Hybrid mobile app framework
    *   `@coinbase/wallet-sdk`: Coinbase Wallet integration
    *   `@metamask/connect-evm`: MetaMask wallet connector
    *   `@nomicfoundation/*`: Hardhat related libraries, potentially for testing or local development setup (e.g., `@nomicfoundation/hardhat-chai-matchers`, `@nomicfoundation/hardhat-ethers`, `@nomicfoundation/hardhat-ignition`, `@nomicfoundation/hardhat-toolbox`, `@nomicfoundation/hardhat-verify`).
    *   `@safe-global/safe-apps-provider`, `@safe-global/safe-apps-sdk`: Safe (Gnosis Safe) integration
    *   `@solana/web3.js`: Solana blockchain interaction
    *   `ethers`: Ethereum utility library
*   **State Management/Data Fetching**: `@tanstack/react-query`
*   **UI/Animation**: `framer-motion`, `lucide-react`, `clsx`, `tailwind-merge`
*   **Utilities**: `assert`, `browserify-zlib`, `buffer`, `crypto-browserify`, `encoding`, `events`, `firebase-admin`, `https-browserify`, `lit`, `lokijs`, `os-browserify`, `path-browserify`, `pino`, `pino-pretty`, `porto`, `process`, `socket.io-client`, `solidity-coverage`, `stream-browserify`, `stream-http`, `url`, `util`. (Many of these are browser polyfills or dependencies of other libraries).

#### `packages/contracts-solidity` (Smart Contracts)
*   **Language**: Solidity
*   **Framework**: Hardhat
*   **Testing**: Chai, Mocha
*   **Tooling**: `dotenv`, `hardhat-gas-reporter`, `solidity-coverage`, `typechain` (`@typechain/ethers-v6`, `@typechain/hardhat`)

#### `packages/types` (Shared Types)
*   **Language**: TypeScript

### Blockchain Network Used
*   **Network Name**: Ethereum Sepolia Testnet
*   **Chain ID**: `11155111` (from `apps/server/src/lib/constants.ts` and `.env.example`)

## 2. PROJECT STRUCTURE

```
/
├── .gitignore               # Specifies intentionally untracked files to ignore.
├── documentation.md         # General project documentation.
├── package-lock.json        # Records the exact dependency tree.
├── package.json             # Root package.json for monorepo configuration and shared scripts.
├── README.md                # This README file.
├── tsconfig.base.json       # Base TypeScript configuration for the monorepo.
├── apps/                    # Contains individual applications.
│   ├── server/              # Backend application.
│   │   ├── .env             # Environment variables (local, sensitive).
│   │   ├── .env.example     # Example environment variables.
│   │   ├── check_db.js      # Script to check database connection status.
│   │   ├── package.json     # Server-specific dependencies and scripts.
│   │   ├── tsconfig.json    # TypeScript configuration for the server.
│   │   ├── dist/            # Compiled JavaScript output.
│   │   ├── node_modules/    # Node.js dependencies.
│   │   ├── scratch/         # Temporary or experimental files.
│   │   └── src/             # Server source code.
│   │       ├── index.ts     # Main entry point for the Express server and Socket.IO.
│   │       ├── controllers/ # Logic handlers for API routes.
│   │       │   ├── auth.controller.ts       # Handles user authentication, nonce generation, signature verification.
│   │       │   ├── chat.controller.ts       # Handles chat requests, messages, and contact management.
│   │       │   ├── media.controller.ts      # Handles media upload/download signing with R2.
│   │       │   └── notification.controller.ts # Handles sending push notifications via FCM.
│   │       ├── lib/         # Utility functions and constants.
│   │       │   ├── constants.ts             # Global constants for the server (e.g., JWT secret, DB URI).
│   │       │   ├── fcm.ts                   # Firebase Cloud Messaging utility functions.
│   │       │   └── r2.ts                    # Cloudflare R2 utility functions.
│   │       ├── middleware/  # Express middleware functions.
│   │       │   ├── auth.middleware.ts       # Middleware for authenticating JWT tokens.
│   │       │   └── rateLimiter.ts           # Middleware for API rate limiting.
│   │       ├── models/      # Mongoose schemas for MongoDB.
│   │       │   ├── ChatRequest.ts           # Defines the schema for chat connection requests.
│   │       │   ├── Message.ts               # Defines the schema for chat messages.
│   │       │   └── User.ts                  # Defines the schema for user profiles (public address, nonce, keys).
│   │       ├── routes/      # Express route definitions.
│   │       │   ├── auth.ts                  # Authentication related API routes.
│   │       │   ├── chat.ts                  # Chat related API routes.
│   │       │   ├── media.ts                 # Media related API routes.
│   │       │   └── notifications.ts         # Notification related API routes.
│   │       ├── scripts/     # Server-side scripts.
│   │       │   └── setup-r2-cors.ts         # Script to configure CORS for Cloudflare R2.
│   │       └── services/    # Placeholder for potential service-layer logic.
│   └── web/                 # Frontend application (Next.js).
│       ├── .env             # Environment variables (local, sensitive).
│       ├── .env.example     # Example environment variables.
│       ├── build.log        # Build output log.
│       ├── build.pid        # Process ID of the build process.
│       ├── capacitor.config.ts # Configuration for Capacitor (hybrid mobile app).
│       ├── next-env.d.ts    # Next.js environment type definitions.
│       ├── next.config.js   # Next.js configuration file.
│       ├── postcss.config.js # PostCSS configuration (for Tailwind CSS).
│       ├── tailwind.config.js # Tailwind CSS configuration.
│       ├── tsconfig.json    # TypeScript configuration for the web app.
│       ├── tsconfig.tsbuildinfo # TypeScript build info file.
│       ├── .idea/           # IDE-specific configuration files (e.g., WebStorm).
│       ├── .next/           # Next.js build output and cache.
│       ├── android/         # Android project files (Capacitor).
│       ├── certificates/    # SSL certificates for local HTTPS development.
│       │   ├── localhost-key.pem  # Local SSL private key.
│       │   └── localhost.pem      # Local SSL certificate.
│       ├── node_modules/    # Node.js dependencies.
│       ├── out/             # Static export output (if applicable).
│       └── src/             # Frontend source code.
│           ├── app/         # Next.js app directory for pages and layouts.
│           │   ├── chat/    # Chat-related pages.
│           │   ├── connect/ # Wallet connection page.
│           │   ├── dashboard/ # User dashboard page.
│           │   ├── invite/  # Invite handling page.
│           │   ├── requests/ # Chat requests page.
│           │   ├── layout.tsx # Root layout for the application.
│           │   └── page.tsx   # Root page component.
│           ├── components/  # Reusable React components.
│           │   ├── chat/    # Chat-specific components.
│           │   ├── ClientProviders.tsx # Client-side context providers.
│           │   ├── Navigation.tsx    # Navigation bar component.
│           │   ├── NotificationManager.tsx # Manages push notifications.
│           │   ├── ThemeProvider.tsx # Provides theme context.
│           │   └── Web3Provider.tsx  # Provides Web3 context (Wagmi, WalletConnect).
│           ├── hooks/       # Custom React hooks.
│           │   ├── useChatContract.ts  # Hook for interacting with the ChatRegistry smart contract.
│           │   └── useWeb3.ts          # Hook for Web3 provider and signer.
│           ├── lib/         # Frontend utility functions and libraries.
│           │   ├── abi/     # Smart contract ABIs.
│           │   ├── api.ts   # API client for the backend server.
│           │   ├── clipboard.ts # Clipboard utility.
│           │   ├── crypto.ts    # Cryptography utilities for E2EE.
│           │   ├── ethereum.ts  # Ethereum related constants and utilities.
│           │   ├── evmNetwork.ts # EVM network related functions (e.g., chain switching).
│           │   ├── localChatStore.ts # Local storage for chat data.
│           │   ├── media.ts       # Media handling utilities.
│           │   ├── storage.ts     # General local storage utilities.
│           │   └── walletLinks.ts # Wallet deep linking utilities.
│           ├── stubs/       # Placeholder for stubs or polyfills.
│           └── styles/      # Global styles.
│               └── globals.css # Global CSS file (Tailwind directives).
├── node_modules/            # Root Node.js dependencies.
└── packages/                # Contains shared packages.
    ├── contracts-solidity/  # Smart contract package.
    │   ├── .env             # Environment variables (local, sensitive).
    │   ├── .env.example     # Example environment variables.
    │   ├── hardhat.config.ts # Hardhat configuration for smart contract development.
    │   ├── package.json     # Smart contract package dependencies and scripts.
    │   ├── tsconfig.json    # TypeScript configuration for the contracts package.
    │   ├── artifacts/       # Compiled contract artifacts.
    │   │   ├── build-info/  # Build information.
    │   │   └── contracts/   # Compiled contract JSONs.
    │   ├── cache/           # Hardhat cache files.
    │   │   └── solidity-files-cache.json # Cache of Solidity files.
    │   ├── contracts/       # Solidity smart contract source files.
    │   │   └── ChatRegistry.sol # Main smart contract for chat identity and message logging.
    │   ├── node_modules/    # Node.js dependencies.
    │   ├── scripts/         # Deployment and utility scripts for contracts.
    │   │   └── deploy.ts    # Script to deploy the ChatRegistry contract.
    │   ├── test/            # Smart contract tests.
    │   │   └── ChatRegistry.test.ts # Tests for the ChatRegistry contract.
    │   └── typechain-types/ # TypeChain generated TypeScript types for contracts.
    │       ├── ChatRegistry.ts  # TypeScript types for ChatRegistry.
    │       ├── common.ts      # Common TypeChain types.
    │       ├── hardhat.d.ts   # Hardhat type extensions.
    │       ├── index.ts       # TypeChain index file.
    │       └── factories/     # TypeChain factories for contracts.
    └── types/               # Shared TypeScript types.
        ├── index.ts         # Main index for shared types.
        └── package.json     # Types package dependencies (minimal).
```

## 3. ALL API ROUTES (apps/server)

All routes are prefixed with their respective modules (e.g., `/auth`, `/chat`, `/media`, `/notifications`). All authenticated routes require a JWT in the `Authorization: Bearer <token>` header.

### Authentication Routes (`/auth`)
*   `POST /auth/nonce`
    *   **Description**: Generates a new nonce for a user based on their public address, or retrieves an existing one. Used for wallet-based authentication.
    *   **Parameters**:
        *   `publicAddress` (string, required): The user's wallet public address.
        *   `walletType` (string, optional): Type of wallet (e.g., 'solana', 'metamask', 'walletconnect').
        *   `chainId` (number, optional): The EVM chain ID the wallet is connected to.
    *   **Returns**: `{ nonce: string }`
*   `POST /auth/verify`
    *   **Description**: Verifies a user's signature against their current nonce. If successful, generates and returns a JWT.
    *   **Parameters**:
        *   `publicAddress` (string, required): The user's wallet public address.
        *   `signature` (string, required): The signed message.
        *   `walletType` (string, optional): Type of wallet (e.g., 'solana', 'metamask', 'walletconnect').
        *   `chainId` (number, optional): The EVM chain ID.
    *   **Returns**: `{ token: string, user: UserObject }`
*   `GET /auth/session` (Authenticated)
    *   **Description**: Retrieves the authenticated user's session information. Optionally fetches `publicKey` from the smart contract if not locally stored.
    *   **Parameters**: None
    *   **Returns**: `{ user: UserObject }`
*   `POST /auth/public-key` (Authenticated)
    *   **Description**: Updates the user's public encryption key on the server.
    *   **Parameters**:
        *   `publicKey` (string, required): The new public encryption key.
    *   **Returns**: `{ message: string }`
*   `POST /auth/fcm-token` (Authenticated)
    *   **Description**: Updates the user's Firebase Cloud Messaging (FCM) token for push notifications.
    *   **Parameters**:
        *   `fcmToken` (string, required): The FCM registration token.
    *   **Returns**: `{ message: string }`
*   `GET /auth/public-key/:wallet`
    *   **Description**: Retrieves the public encryption key for a given wallet address. Falls back to checking the smart contract if not found on the server.
    *   **Parameters**:
        *   `wallet` (string, in URL path, required): The target user's wallet public address.
    *   **Returns**: `{ publicKey: string }`

### Chat Routes (`/chat`)
*   `POST /chat/request` (Authenticated)
    *   **Description**: Sends a chat connection request to another user. Handles existing requests and auto-accepts mutual requests.
    *   **Parameters**:
        *   `fromUserId` (string, required): The ID of the requesting user (must match authenticated user).
        *   `toPublicKey` (string, required): The public key or public address of the recipient.
    *   **Returns**: `ChatRequestObject`
*   `POST /chat/respond` (Authenticated)
    *   **Description**: Responds to a pending chat request (accept or reject).
    *   **Parameters**:
        *   `requestId` (string, required): The ID of the chat request.
        *   `status` (string, required): 'accepted' or 'rejected'.
    *   **Returns**: `ChatRequestObject`
*   `GET /chat/requests` (Authenticated)
    *   **Description**: Retrieves all incoming, outgoing, and accepted chat requests for the authenticated user.
    *   **Parameters**:
        *   `userId` (string, optional, in query): User ID (must match authenticated user).
    *   **Returns**: `{ incoming: ChatRequestObject[], outgoing: ChatRequestObject[], contacts: ChatRequestObject[] }`
*   `DELETE /chat/request/:requestId` (Authenticated)
    *   **Description**: Removes a chat connection request.
    *   **Parameters**:
        *   `requestId` (string, in URL path, required): The ID of the chat request to remove.
    *   **Returns**: `{ message: string }`
*   `GET /chat/messages/:roomId` (Authenticated)
    *   **Description**: Retrieves messages for a specific chat room (between two users).
    *   **Parameters**:
        *   `roomId` (string, in URL path, required): The unique identifier for the chat room.
        *   `currentUserId` (string, optional, in query): User ID (must match authenticated user).
    *   **Returns**: `MessageObject[]` (formatted with sender 'me' or 'other')
*   `POST /chat/send-message` (Authenticated)
    *   **Description**: Persists an encrypted message to the database.
    *   **Parameters**:
        *   `senderId` (string, required): The ID of the sending user (must match authenticated user).
        *   `recipientPublicKey` (string, required): The public key or public address of the recipient.
        *   `encryptedContent` (string, required): The encrypted message content.
        *   `encryptedContentForSender` (string, optional): Encrypted content for the sender's own device (for message sync).
        *   `encryptedMediaMeta` (object, optional): Encrypted metadata for media files.
    *   **Returns**: `{ relayOnly: boolean, queuedOnClient: boolean, roomId: string, messageId: string, hasEncryptedMediaMeta: boolean, message: string }`
*   `GET /chat/unreadCounts` (Authenticated)
    *   **Description**: Retrieves unread message counts for all active chat connections of the authenticated user.
    *   **Parameters**:
        *   `userId` (string, optional, in query): User ID (must match authenticated user).
    *   **Returns**: `{ [contactUserId: string]: number }`
*   `PUT /chat/contact-name` (Authenticated)
    *   **Description**: Updates a custom display name for a contact.
    *   **Parameters**:
        *   `userId` (string, required): The ID of the user performing the update.
        *   `contactUserId` (string, required): The ID of the contact whose name is being updated.
        *   `customName` (string, optional): The custom name to set.
    *   **Returns**: `{ message: string, customName: string | undefined }`
*   `POST /chat/disconnect` (Authenticated)
    *   **Description**: Disconnects (hides) a chat connection for the authenticated user.
    *   **Parameters**:
        *   `userId` (string, required): The ID of the user performing the disconnection.
        *   `contactUserId` (string, required): The ID of the contact to disconnect from.
    *   **Returns**: `{ message: string }`

### Media Routes (`/media`)
*   `POST /media/sign-upload` (Authenticated)
    *   **Description**: Generates a pre-signed URL for direct media upload to Cloudflare R2.
    *   **Parameters**:
        *   `fileName` (string, required): Original name of the file.
        *   `contentType` (string, required): MIME type of the file.
        *   `size` (number, required): Size of the file in bytes.
    *   **Returns**: `{ objectKey: string, uploadUrl: string, expiresIn: number, maxFileBytes: number }`
*   `POST /media/sign-download` (Authenticated)
    *   **Description**: Generates a pre-signed URL for media download from Cloudflare R2. Ensures the user has an accepted connection with the uploader.
    *   **Parameters**:
        *   `objectKey` (string, required): The unique key of the object in R2.
    *   **Returns**: `{ objectKey: string, downloadUrl: string, expiresIn: number }`
*   `POST /media/upload` (Authenticated)
    *   **Description**: Proxies a file upload to Cloudflare R2 through the server.
    *   **Parameters**: `file` (multipart/form-data, required): The file to upload.
    *   **Returns**: `{ objectKey: string, message: string }`

### Notifications Routes (`/notifications`)
*   `POST /notifications/send` (Authenticated)
    *   **Description**: Sends a push notification via Firebase Cloud Messaging (FCM). (Note: This is likely for testing or admin purposes, as general users shouldn't trigger arbitrary notifications).
    *   **Parameters**:
        *   `token` (string, required): The FCM device token.
        *   `title` (string, required): Notification title.
        *   `body` (string, required): Notification body.
        *   `data` (object, optional): Additional data payload.
    *   **Returns**: `{ messageId: string }`

### Health Check
*   `GET /health`
    *   **Description**: Provides a basic health check for the server, including uptime, database connection status, and number of online Socket.IO users.
    *   **Parameters**: None
    *   **Returns**: `{ status: string, uptime: number, db: string, onlineUsers: number }`

## 4. DATABASE SCHEMA (MongoDB via Mongoose)

### `User` Model
Represents a user in the system, identified by their wallet address.
*   `publicAddress`: (String, required, unique) The user's blockchain public address.
*   `nonce`: (String, required) A random string used for signature-based authentication to prevent replay attacks.
*   `username`: (String, optional) User's chosen username.
*   `displayName`: (String, optional) User's display name.
*   `avatarUrl`: (String, optional) URL to the user's avatar image.
*   `walletType`: (String, enum: `['walletconnect', 'metamask', 'solana']`, default: `'walletconnect'`) The type of wallet used by the user.
*   `publicKey`: (String, unique, sparse) The user's public encryption key, used for E2EE. Stored sparsely to allow null values and ensure uniqueness when present.
*   `shortId`: (String, unique, sparse) A short, human-readable ID for the user (e.g., `CHAT-A1B2C3D4`).
*   `fcmToken`: (String, optional) Firebase Cloud Messaging token for push notifications.
*   `lastSeenAt`: (Date, default: `Date.now`) Timestamp of the user's last activity.
*   `timestamps`: (Boolean) Mongoose default timestamps (`createdAt`, `updatedAt`).

### `Message` Model
Represents an individual chat message exchanged between users.
*   `sender`: (ObjectId, ref: `User`, required) Reference to the `User` who sent the message.
*   `roomId`: (String, required, index) A unique identifier for the chat conversation (e.g., `addressA-addressB`).
*   `encryptedContent`: (String, required) The end-to-end encrypted message content.
*   `encryptedContentForSender`: (String, optional) Encrypted content for the sender's own device, potentially using a different key.
*   `timestamp`: (Date, default: `Date.now`) The time the message was sent.
*   `read`: (Boolean, default: `false`) Indicates if the message has been read by the recipient.
*   `timestamps`: (Boolean) Mongoose default timestamps (`createdAt`, `updatedAt`).

### `ChatRequest` Model
Manages chat connection requests and accepted contacts.
*   `from`: (ObjectId, ref: `User`, required) Reference to the `User` who initiated the request.
*   `to`: (ObjectId, ref: `User`, required) Reference to the `User` who is the recipient of the request.
*   `fromWallet`: (String, required) The wallet address of the `from` user.
*   `toWallet`: (String, required) The wallet address of the `to` user.
*   `status`: (String, enum: `['pending', 'accepted', 'rejected']`, default: `'pending'`) The status of the chat request.
*   `fromCustomName`: (String, optional) A custom name set by the `from` user for the `to` user.
*   `toCustomName`: (String, optional) A custom name set by the `to` user for the `from` user.
*   `hiddenBy`: (Array of ObjectId, ref: `User`) An array of user IDs who have "hidden" or "disconnected" this chat, effectively archiving it for them without deleting.
*   `timestamps`: (Boolean) Mongoose default timestamps (`createdAt`, `updatedAt`).
*   **Indexes**: Unique index on `{ fromWallet: 1, toWallet: 1 }` to prevent duplicate requests between the same two wallets.

## 5. WALLET & BLOCKCHAIN

### How Wallet Connection Works
The frontend (`apps/web`) uses `wagmi` and `web3modal` to facilitate wallet connections.
1.  **Provider Setup**: `wagmi` is configured with `sepolia` chain, and connectors for `walletConnect`, `MetaMask`, and `Coinbase Wallet`.
2.  **Connection Flow**:
    *   When a user initiates connection, `web3modal` handles the UI for selecting a wallet.
    *   `wagmi`'s `useWalletClient` hook provides an EIP-1193 compatible provider.
    *   This provider is wrapped by `ethers.BrowserProvider` to obtain a full `ethers` Signer.
3.  **Authentication**: After connecting, the client requests a `nonce` from the backend (`POST /auth/nonce`). The user signs this nonce with their connected wallet, and the signature is sent to the backend for verification (`POST /auth/verify`).
    *   For EVM wallets (MetaMask, WalletConnect), `ethers.verifyMessage` is used.
    *   For Solana wallets, `tweetnacl` and `bs58` are used for signature verification.
    *   Successful verification results in a JWT being issued by the backend.

### Which Wallet Libraries are Used
*   **Frontend (`apps/web`)**:
    *   `wagmi`: Core library for React hooks with Ethereum.
    *   `viem`: Underlying low-level Ethereum client used by wagmi.
    *   `@web3modal/wagmi`: UI component for wallet connection.
    *   `@coinbase/wallet-sdk`: Specific connector for Coinbase Wallet.
    *   `@metamask/connect-evm`: Specific connector for MetaMask.
    *   `@solana/web3.js`: For interacting with Solana wallets and blockchain.
*   **Backend (`apps/server`)**:
    *   `ethers`: Primarily for verifying EVM signatures.
    *   `tweetnacl`, `bs58`: For verifying Solana signatures.

### Smart Contract Addresses
*   **ChatRegistry (Sepolia)**: `0x878d7cD665048506ed1B233D3945595CDE2ebEc3` (Hardcoded in both `apps/server/src/controllers/auth.controller.ts` and `apps/web/src/lib/ethereum.ts`)

### Which functions are called on chain
The `ChatRegistry.sol` smart contract provides the following functions:
*   `registerIdentity(bytes calldata _encryptionKey)`:
    *   **Description**: Allows a user to register or update their public encryption key on the blockchain. This key is crucial for end-to-end encrypted communication.
    *   **Called by**: Frontend `apps/web` via `useChatContract().registerIdentity()`.
*   `sendMessage(address _to, bytes32 _messageHash)`:
    *   **Description**: Logs a message transaction on-chain, associating a message hash (of the encrypted payload) with a sender and recipient. Optionally allows sending a tip (`msg.value`) to the recipient.
    *   **Called by**: Not explicitly called by current frontend code for messages, seems like a placeholder or future feature. Currently, message persistence is handled by the backend MongoDB.
*   `getEncryptionKey(address _user)` (view function):
    *   **Description**: Retrieves the public encryption key for a specific user from the blockchain.
    *   **Called by**: Backend `apps/server` (in `auth.controller.ts` fallback logic) and Frontend `apps/web` via `useEncryptionKey()`.

## 6. ENVIRONMENT VARIABLES

### `apps/server/.env.example`
*   `PORT`: The port the Express server will listen on.
*   `MONGODB_URI`: Connection string for the MongoDB database.
*   `NODE_ENV`: Node.js environment (e.g., `production`, `development`).
*   `JWT_SECRET`: Secret key for signing and verifying JWTs.
*   `JWT_EXPIRES_DAYS`: Expiration time for JWTs (e.g., `7d`).
*   `CORS_ORIGIN`: Comma-separated list of allowed origins for CORS.
*   `WALLETCONNECT_PROJECT_ID`: Project ID obtained from WalletConnect Cloud.
*   `SEPOLIA_CHAIN_ID`: The chain ID for the Sepolia testnet (EVM).
*   `SEPOLIA_RPC_URL`: RPC URL for the Sepolia testnet.
*   `R2_ACCOUNT_ID`: Cloudflare R2 account ID.
*   `R2_ACCESS_KEY_ID`: Cloudflare R2 access key ID.
*   `R2_SECRET_ACCESS_KEY`: Cloudflare R2 secret access key.
*   `R2_BUCKET`: The name of the Cloudflare R2 bucket.
*   `R2_PUBLIC_BASE_URL`: Base URL for public access to R2 objects.
*   `R2_REGION`: Region for the R2 bucket (e.g., `auto`).
*   `R2_SIGNED_URL_TTL_SECONDS`: Expiration time for R2 signed URLs in seconds.
*   `MAX_MEDIA_FILE_BYTES`: Maximum allowed media file size in bytes for uploads.
*   `FCM_PROJECT_ID`: Firebase project ID for push notifications.
*   `FCM_CLIENT_EMAIL`: Firebase service account client email.
*   `FCM_PRIVATE_KEY`: Firebase service account private key (multiline, formatted).

### `apps/web/.env.example`
*   `NEXT_PUBLIC_SERVER_URL`: URL of the backend server API.
*   `NEXT_PUBLIC_SOLANA_RPC`: RPC URL for the Solana network.
*   `NEXT_PUBLIC_EVM_CHAIN_ID`: The chain ID for the target EVM network (e.g., Sepolia).
*   `NEXT_PUBLIC_ANKR_SEPOLIA_RPC`: Ankr public RPC endpoint for Sepolia (read-only EVM operations).
*   `NEXT_PUBLIC_ANKR_MAINNET_RPC`: Ankr public RPC endpoint for Ethereum Mainnet (read-only EVM operations).

### `packages/contracts-solidity/.env.example`
*   `PRIVATE_KEY`: Private key for deploying contracts (use with caution, for development only).
*   `RPC_URL`: RPC URL for the deployment network (e.g., Sepolia).
*   `ETHERSCAN_API_KEY`: API key for Etherscan verification.

## 7. KNOWN BUGS & ISSUES

*   **Hardcoded Smart Contract Address**: The `CHAT_REGISTRY_ADDRESS` is hardcoded in `apps/server/src/controllers/auth.controller.ts` and `apps/web/src/lib/ethereum.ts`. This should ideally be fetched from a configuration service or environment variable for easier deployment to different networks.
    *   `apps/server/src/controllers/auth.controller.ts`: L31 `const CHAT_REGISTRY_ADDRESS = '0x878d7cD665048506ed1B233D3945595CDE2ebEc3';`
    *   `apps/web/src/lib/ethereum.ts`: L65 `export const CHAT_REGISTRY_ADDRESS = '0x878d7cD665048506ed1B233D3945595CDE2ebEc3';`
*   **Hardcoded WalletConnect Project ID**: The `projectId` for WalletConnect is hardcoded in `apps/web/src/lib/ethereum.ts`. This should be managed via environment variables.
    *   `apps/web/src/lib/ethereum.ts`: L18 `export const projectId = 'aa08f17d20b4bd829127fd97bbf91f00';`
*   **Hardcoded RPC URL Fallback**: In `apps/web/src/hooks/useWeb3.ts`, a fallback RPC URL for Sepolia is hardcoded. While it serves as a stable alternative, it bypasses the environment variable configuration if `NEXT_PUBLIC_ANKR_SEPOLIA_RPC` fails.
    *   `apps/web/src/hooks/useWeb3.ts`: L30 `const rpcUrl = process.env.NEXT_PUBLIC_ANKR_SEPOLIA_RPC || 'https://ethereum-sepolia-rpc.publicnode.com';`
*   **Capacitor `TODO`s in `native-bridge.js`**:
    *   `apps/web/android/app/build/intermediates/assets/debug/mergeDebugAssets/native-bridge.js`: Lines 143, 145, 688 show `TODO`s related to exporting functions as Capacitor functions and adding progress event emission on the native side. These are likely development notes for mobile integration.
*   **Server-side `sendMessage` contract interaction**: The `ChatRegistry.sol` contract has a `sendMessage` function, but the backend's `sendMessage` API route does not appear to interact with this function. Message persistence is handled in MongoDB. This suggests a potential unimplemented feature or a discrepancy between contract design and current backend implementation for on-chain message logging.

## 8. AUTHENTICATION FLOW

1.  **Wallet Connection**:
    *   The user connects their cryptocurrency wallet (EVM or Solana) to the frontend application.
    *   The frontend uses `wagmi`, `web3modal`, and specific connectors (MetaMask, WalletConnect, Coinbase Wallet) for EVM, and `@solana/web3.js` for Solana.
2.  **Nonce Request**:
    *   The frontend sends the user's `publicAddress` and `walletType` to the backend's `/auth/nonce` endpoint.
    *   The backend generates a unique `nonce` (random string) and stores it associated with the `publicAddress` in the `User` model. If the user doesn't exist, a new `User` record is created.
3.  **Signature Generation**:
    *   The backend returns the `nonce` to the frontend.
    *   The frontend prompts the user to sign a message containing this `nonce` (e.g., "I am signing my one-time nonce: <nonce>") using their connected wallet.
4.  **Signature Verification**:
    *   The frontend sends the `publicAddress`, `signature`, `walletType`, and `chainId` to the backend's `/auth/verify` endpoint.
    *   The backend retrieves the stored `nonce` for the `publicAddress`.
    *   It then verifies the signature:
        *   **EVM Wallets**: Uses `ethers.verifyMessage(message, signature)` to recover the signing address and compares it with the provided `publicAddress`.
        *   **Solana Wallets**: Uses `tweetnacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes)`.
    *   If the signature is valid, the backend updates the user's `nonce` (to prevent replay attacks) and generates a JSON Web Token (JWT).
5.  **Session Management**:
    *   The generated JWT contains user information (`id`, `publicAddress`, `walletType`) and is signed with a `JWT_SECRET`.
    *   This JWT is sent back to the frontend, which stores it (e.g., in local storage).
    *   For subsequent authenticated API requests, the frontend includes this JWT in the `Authorization: Bearer <token>` header.
    *   The `auth.middleware.ts` on the server verifies this JWT for each protected route.
6.  **Public Key Management**:
    *   Users can update their public encryption key via `POST /auth/public-key`.
    *   The backend can also retrieve public keys for other users via `GET /auth/public-key/:wallet`, with a fallback to querying the `ChatRegistry` smart contract if the key is not found in the database.

## 9. CHAT SYSTEM

### How messages are sent and received
The chat system uses a hybrid approach:
1.  **Real-time Communication (Socket.IO)**:
    *   The primary mechanism for real-time message exchange is Socket.IO.
    *   Users establish a Socket.IO connection to the backend, authenticating with their JWT.
    *   When a user connects, they join a personal room (`user:<userId>`) and specific chat rooms (e.g., `addressA-addressB`) upon request.
    *   **`send_message` event**: A client emits `send_message` with recipient's public key and encrypted content. The server then relays this message to all active sockets in the recipient's chat room and personal room via `io.to(roomId).emit('receive_message', payload)`.
    *   **`receive_message` event**: Clients listen for this event to get new incoming messages.
    *   **`message_delivered` / `message_read` events**: Clients emit these events to update message status. The server relays these statuses to relevant participants.
2.  **API Persistence (REST API)**:
    *   In addition to Socket.IO, messages can also be sent via the `POST /chat/send-message` REST API endpoint. This endpoint persists the encrypted message to the MongoDB database.
    *   This dual approach likely ensures message delivery even if a recipient is offline (they'll receive messages when they next connect to the API or fetch messages) and provides real-time updates for online users.
3.  **End-to-End Encryption (E2EE)**: Messages are encrypted client-side using public keys exchanged via the server or the `ChatRegistry` smart contract. The server stores only the encrypted payload.

### Real-time or polling based?
Predominantly **real-time** using Socket.IO for active users. The `/chat/messages/:roomId` API endpoint provides polling/fetching of historical messages, while `/chat/unreadCounts` gives counts for unread messages.

### How messages are stored
*   Messages are stored in a **MongoDB database** in the `Message` collection.
*   Each message document includes the `sender` (User ObjectId), `roomId` (conversation identifier), `encryptedContent`, `encryptedContentForSender`, `timestamp`, and `read` status.

## 10. DEPENDENCIES

### Root `package.json`
*   `events`: ^3.3.0 (used by ox)
*   `ox`: 0.14.20
*   `rimraf`: ^5.0.0 (development)
*   `ts-node`: ^10.9.0 (development)
*   `typescript`: ^5.0.0 (development)

### `apps/server/package.json`
#### Dependencies
*   `@aws-sdk/client-s3`: ^3.1035.0 (Cloudflare R2 interaction)
*   `@aws-sdk/s3-request-presigner`: ^3.1035.0 (Generate signed R2 URLs)
*   `@nomicfoundation/hardhat-verify`: 3.0.16 (Likely unused on server-side or for testing specific server logic related to contracts)
*   `@nomicfoundation/ignition-core`: 3.1.4 (Likely unused on server-side or for testing specific server logic related to contracts)
*   `@solana/web3.js`: ^0.0.3 (Solana signature verification)
*   `@wagmi/connectors`: 7.2.1 (Likely unused on server-side)
*   `bs58`: ^6.0.0 (Solana utilities)
*   `compression`: ^1.8.1 (Gzip compression)
*   `cors`: ^2.8.6 (CORS middleware)
*   `dotenv`: ^16.6.1 (Environment variable loading)
*   `ethers`: ^6.16.0 (EVM signature verification, contract interaction)
*   `express`: ^4.22.1 (Web framework)
*   `express-rate-limit`: ^8.4.0 (Rate limiting middleware)
*   `firebase-admin`: ^10.1.0 (Firebase Cloud Messaging)
*   `helmet`: ^8.1.0 (Security middleware)
*   `jsonwebtoken`: ^9.0.3 (JWT handling)
*   `mongodb-memory-server`: ^10.1.4 (Development/testing in-memory MongoDB)
*   `mongoose`: ^7.8.9 (MongoDB ORM)
*   `morgan`: ^1.10.1 (HTTP request logger)
*   `multer`: ^2.1.1 (Multipart form data handling for file uploads)
*   `next`: 9.3.3 (Likely unused, typical frontend framework, potentially vestigial) - **Redundant**
*   `socket.io`: ^4.8.3 (Real-time communication)
*   `solidity-coverage`: ^0.7.22 (Likely unused on server-side, for contract testing)
*   `tweetnacl`: ^1.0.3 (Solana signature verification)
*   `uuid`: ^13.0.0 (UUID generation)
#### Dev Dependencies
*   `@types/compression`: ^1.8.1
*   `@types/cors`: ^2.8.13
*   `@types/express`: ^4.17.17
*   `@types/jsonwebtoken`: ^9.0.10
*   `@types/morgan`: ^1.9.10
*   `@types/multer`: ^2.1.0
*   `@types/node`: ^18.15.11
*   `nodemon`: ^3.1.14
*   `ts-node`: ^10.9.1
*   `typescript`: ^5.0.4

### `apps/web/package.json`
#### Dependencies
*   `@base-org/account`: ^2.5.5 (Unused, likely vestigial or specific integration) - **Redundant**
*   `@capacitor/android`: ^8.3.1
*   `@capacitor/cli`: ^8.3.1
*   `@capacitor/core`: ^8.3.1
*   `@coinbase/wallet-sdk`: ^4.3.7
*   `@metamask/connect-evm`: ^1.0.0
*   `@nomicfoundation/hardhat-chai-matchers`: 3.0.0 (Unused, Hardhat testing utility) - **Redundant**
*   `@nomicfoundation/hardhat-ethers`: 4.0.10 (Unused, Hardhat utility) - **Redundant**
*   `@nomicfoundation/hardhat-ignition`: 3.1.4 (Unused, Hardhat utility) - **Redundant**
*   `@nomicfoundation/hardhat-ignition-ethers`: 3.1.4 (Unused, Hardhat utility) - **Redundant**
*   `@nomicfoundation/hardhat-network-helpers`: 3.0.7 (Unused, Hardhat testing utility) - **Redundant**
*   `@nomicfoundation/hardhat-toolbox`: 7.0.0 (Unused, Hardhat utility) - **Redundant**
*   `@nomicfoundation/hardhat-verify`: 3.0.16 (Unused, Hardhat utility) - **Redundant**
*   `@nomicfoundation/ignition-core`: 3.1.4 (Unused, Hardhat utility) - **Redundant**
*   `@safe-global/safe-apps-provider`: ^0.18.6
*   `@safe-global/safe-apps-sdk`: ^9.1.0
*   `@solana/errors`: ^5.5.1
*   `@solana/web3.js`: 0.0.3
*   `@tanstack/react-query`: ^5.100.8
*   `@wagmi/connectors`: ^7.2.1
*   `@web3modal/wagmi`: ^5.1.11
*   `assert`: ^2.1.0 (Browser polyfill)
*   `browserify-zlib`: ^0.2.0 (Browser polyfill)
*   `buffer`: ^6.0.3 (Browser polyfill)
*   `clsx`: ^2.1.1 (Utility for conditionally joining class names)
*   `crypto-browserify`: ^3.5.1 (Browser polyfill)
*   `encoding`: ^0.1.13 (Browser polyfill)
*   `events`: ^3.3.0 (Browser polyfill, also used by wagmi)
*   `firebase-admin`: 10.1.0 (Likely unused in frontend, common backend dependency) - **Redundant**
*   `framer-motion`: ^12.38.0
*   `https-browserify`: ^1.0.0 (Browser polyfill)
*   `lit`: ^3.3.2 (Web component library, possibly for WalletConnect UI)
*   `lokijs`: ^1.5.12 (In-memory database, possibly for local caching)
*   `lucide-react`: ^1.14.0 (Icon library)
*   `next`: ^9.3.3 (Core Next.js, version seems old) - **Consider upgrading Next.js.**
*   `os-browserify`: ^0.3.0 (Browser polyfill)
*   `path-browserify`: ^1.0.1 (Browser polyfill)
*   `pino`: ^10.3.1 (Logging)
*   `pino-pretty`: ^13.1.3 (Pretty logging)
*   `porto`: ^0.2.37 (Unused) - **Redundant**
*   `process`: ^0.11.10 (Browser polyfill)
*   `react`: ^19.2.5
*   `react-dom`: ^19.2.5
*   `socket.io-client`: ^4.8.3
*   `solidity-coverage`: 0.7.22 (Unused, for contract testing) - **Redundant**
*   `stream-browserify`: ^3.0.0 (Browser polyfill)
*   `stream-http`: ^3.2.0 (Browser polyfill)
*   `tailwind-merge`: ^3.5.0 (Utility for Tailwind CSS class merging)
*   `url`: ^0.11.4 (Browser polyfill)
*   `util`: ^0.12.5 (Browser polyfill)
*   `viem`: latest
*   `wagmi`: ^3.5.0
#### Dev Dependencies
*   `@tailwindcss/postcss`: ^4.2.4
*   `@types/node`: ^25.6.0
*   `@types/react`: ^19.2.14
*   `@types/react-dom`: ^19.2.3
*   `autoprefixer`: ^10.5.0
*   `postcss`: ^8.5.13
*   `tailwindcss`: ^4.2.4
*   `typescript`: ^6.0.3

### `packages/contracts-solidity/package.json`
#### Dev Dependencies
*   `@nomicfoundation/hardhat-chai-matchers`: ^3.0.0
*   `@nomicfoundation/hardhat-ethers`: ^4.0.10
*   `@nomicfoundation/hardhat-ignition`: ^3.1.4
*   `@nomicfoundation/hardhat-ignition-ethers`: ^3.1.4
*   `@nomicfoundation/hardhat-network-helpers`: ^3.0.7
*   `@nomicfoundation/hardhat-toolbox`: ^7.0.0
*   `@nomicfoundation/hardhat-verify`: ^3.0.16
*   `@nomicfoundation/ignition-core`: ^3.1.4
*   `@typechain/ethers-v6`: ^0.5.1
*   `@typechain/hardhat`: ^9.1.0
*   `@types/chai`: ^4.3.20
*   `@types/mocha`: ^10.0.10
*   `chai`: ^4.5.0
*   `dotenv`: ^16.6.1
*   `ethers`: ^6.16.0
*   `hardhat`: ^2.22.17
*   `hardhat-gas-reporter`: ^1.0.10
*   `solidity-coverage`: ^0.7.22
*   `typechain`: ^8.3.2
#### Dependencies
*   `@solana/web3.js`: 0.0.3 (Likely unused here, common client-side dependency) - **Redundant**
*   `@wagmi/connectors`: 7.2.1 (Likely unused here, common client-side dependency) - **Redundant**
*   `firebase-admin`: 10.1.0 (Likely unused here, common server-side dependency) - **Redundant**
*   `next`: 9.3.3 (Likely unused, common frontend dependency) - **Redundant**

### Redundant/Unused Dependencies Summary:
*   `apps/server/package.json`: `next`, `@nomicfoundation/hardhat-verify`, `@nomicfoundation/ignition-core`, `solidity-coverage`, `@wagmi/connectors`
*   `apps/web/package.json`: `@base-org/account`, `@nomicfoundation/hardhat-chai-matchers`, `@nomicfoundation/hardhat-ethers`, `@nomicfoundation/hardhat-ignition`, `@nomicfoundation/hardhat-ignition-ethers`, `@nomicfoundation/hardhat-network-helpers`, `@nomicfoundation/hardhat-toolbox`, `@nomicfoundation/hardhat-verify`, `@nomicfoundation/ignition-core`, `firebase-admin`, `porto`, `solidity-coverage`
*   `packages/contracts-solidity/package.json`: `@solana/web3.js`, `@wagmi/connectors`, `firebase-admin`, `next`

These "redundant" packages often appear in monorepos due to shared dependencies or copy-pasting package configurations. It's recommended to review if they are truly necessary for each sub-package or if they can be managed more efficiently at the root level or removed entirely if unused. The `next` version in `apps/web` also seems quite old (`9.3.3`) and should be updated.
# Wallet-Chat
