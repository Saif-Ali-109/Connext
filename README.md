# 🚀 Wallet Chat: Secure & Decentralized Messenger

Wallet Chat is an innovative end-to-end encrypted chat application that redefines secure communication by integrating directly with cryptocurrency wallets for authentication and identity management. Leveraging cutting-edge blockchain technology and robust encryption, Wallet Chat offers a decentralized platform where users can communicate securely across both EVM-compatible and Solana blockchain ecosystems.

---

## ✨ Features

*   **Wallet-Based Authentication:** Seamlessly connect and authenticate using your Ethereum (EVM) or Solana wallet. Your wallet is your identity.
*   **End-to-End Encryption (E2EE):** All messages are encrypted client-side, ensuring only the sender and intended recipient can read them. The server stores only encrypted payloads.
*   **Decentralized Identity:** Register and manage your public encryption keys on-chain via smart contracts, enhancing security and trust.
*   **Real-time Messaging:** Enjoy instant, real-time communication powered by Socket.IO for a fluid chat experience.
*   **Cross-Chain Compatibility:** Supports both EVM (Ethereum, Sepolia Testnet) and Solana wallets, bridging different blockchain communities.
*   **Secure Media Sharing:** Share media files confidently with pre-signed URLs via Cloudflare R2, ensuring secure and controlled access.
*   **Push Notifications:** Stay updated with important messages through Firebase Cloud Messaging (FCM).
*   **Robust Backend:** Built with Express/Node.js, MongoDB for message persistence, and Mongoose for data modeling.
*   **Modern Frontend:** A responsive and intuitive user interface developed with Next.js (web and mobile via Capacitor) and Tailwind CSS.
*   **Smart Contract Integration:** Utilizes Solidity smart contracts on the Ethereum Sepolia network for key management.

## 💡 Why Wallet Chat?

In an era of increasing digital surveillance and data breaches, Wallet Chat stands out by offering:
*   **Uncompromised Privacy:** E2EE ensures your conversations remain private.
*   **True Ownership of Identity:** Your wallet serves as your immutable digital identity, eliminating the need for traditional, centralized accounts.
*   **Resistance to Censorship:** By leveraging decentralized principles, Wallet Chat aims to provide a more resilient communication platform.
*   **Enhanced Security:** Signature-based authentication prevents common attack vectors, and on-chain key registration adds an extra layer of trust.

---

## 📸 Screenshots / Demos

*(To be added: Include screenshots or short GIF/video demonstrations of the application in action. Showcase wallet connection, chat interface, and media sharing.)*

---

## ⚙️ Getting Started

Follow these steps to set up and run the Wallet Chat application locally.

### Prerequisites

*   **Node.js**: v18.x or later (includes npm)
*   **npm**: v9.x or later
*   **MongoDB**: An instance of MongoDB (local or cloud-hosted)
*   **Git**: For cloning the repository
*   **MetaMask / Phantom Wallet**: For testing wallet connections.

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/saif634/Wallet-Chat.git
    cd Wallet-Chat
    ```
2.  **Install root dependencies:**
    ```bash
    npm install
    ```
3.  **Install sub-project dependencies:**
    ```bash
    npm install --workspace apps/server
    npm install --workspace apps/web
    npm install --workspace packages/contracts-solidity
    npm install --workspace packages/types
    ```

### Configuration

Each application within the monorepo requires specific environment variables. Create `.env` files based on the provided `.env.example` files in each respective directory. Refer to the existing `README.md` for detailed variable descriptions.

*   `apps/server/.env`
*   `apps/web/.env`
*   `packages/contracts-solidity/.env`

### Running the Applications

For a full development environment, you can run both the backend and frontend simultaneously, or start them independently.

1.  **Start Both Backend and Frontend (Recommended for Development):**
    ```bash
    npm run dev
    ```
    This command will concurrently start the backend server (default `http://localhost:4001`) and the frontend web application (default `http://localhost:3000`).

2.  **Start the Backend Server Independently:**
    ```bash
    npm run dev:server
    ```
    The server should start on the port specified in `apps/server/.env` (default `4001`).

3.  **Start the Frontend Web Application Independently:**
    ```bash
    npm run dev:web
    ```
    The web application should start on `http://localhost:3000` (default for Next.js).

4.  **Compile Smart Contracts:**
    ```bash
    cd packages/contracts-solidity
    npx hardhat compile
    ```

5.  **Deploy Smart Contracts (Development):**
    ```bash
    cd packages/contracts-solidity
    npx hardhat run scripts/deploy.ts --network sepolia
    ```
    *(Ensure `PRIVATE_KEY` and `RPC_URL` are configured in `packages/contracts-solidity/.env` for the target network).*

---

## 🛠️ Tech Stack & Architecture

Wallet Chat is built as a robust monorepo, orchestrating multiple services to deliver a seamless decentralized chat experience.

#### Monorepo Root
*   `npm`: Workspace management
*   `TypeScript`: Core language for type safety across the project

#### `apps/server` (Backend - Express/Node.js)
*   **Language**: TypeScript
*   **Framework**: Express.js
*   **Database**: MongoDB (via Mongoose ORM)
*   **Authentication**: JWT, Nacl (Solana), Ethers (EVM)
*   **Real-time**: Socket.IO
*   **Cloud Storage**: AWS SDK (S3 client for Cloudflare R2)
*   **Notifications**: Firebase Admin SDK (FCM)
*   **Security**: Helmet, Compression, Express Rate Limit

#### `apps/web` (Frontend - Next.js/React)
*   **Language**: TypeScript
*   **Framework**: Next.js, React
*   **Styling**: Tailwind CSS
*   **Web3**: Wagmi, Viem, Web3Modal, `@solana/web3.js` (for cross-chain wallet integration)
*   **Hybrid Mobile**: Capacitor (for Android & iOS builds)
*   **State Management**: `@tanstack/react-query`

#### `packages/contracts-solidity` (Smart Contracts)
*   **Language**: Solidity
*   **Framework**: Hardhat
*   **Testing**: Chai, Mocha
*   **Tooling**: Typechain (for TypeScript bindings)

#### `packages/types` (Shared Types)
*   **Language**: TypeScript
*   **Purpose**: Centralized type definitions for consistency across the monorepo.

---

## 🔑 Authentication Flow

Wallet Chat's authentication is entirely wallet-driven, providing a secure and decentralized identity layer:

1.  **Wallet Connection**: User connects their EVM or Solana wallet via the frontend.
2.  **Nonce Request**: Frontend requests a unique `nonce` from the backend, associated with the user's public address.
3.  **Signature Generation**: User signs the `nonce` message with their connected wallet.
4.  **Signature Verification**: The signed message is sent to the backend for cryptographic verification against the stored `nonce`.
5.  **JWT Issuance**: Upon successful verification, the backend issues a JSON Web Token (JWT) for session management.
6.  **Public Key Management**: Users can register and retrieve their public encryption keys on the blockchain via the `ChatRegistry` smart contract, or store them on the server.

---

## 💬 Chat System

The chat system employs a hybrid approach for efficiency and reliability:

*   **Real-time Communication**: Primarily uses **Socket.IO** for instant message delivery and real-time status updates between online users.
*   **Message Persistence**: All messages are securely stored in a **MongoDB database** (encrypted, of course). Historical messages are fetched via a REST API.
*   **End-to-End Encryption**: Messages are encrypted on the sender's device and decrypted only by the recipient, ensuring maximum privacy. The server never has access to the unencrypted content.

---

## 🔗 Blockchain Integration

Wallet Chat leverages blockchain for core functionalities:

*   **Identity & Key Management**: The `ChatRegistry.sol` smart contract on the Ethereum Sepolia Testnet allows users to register and retrieve their public encryption keys directly on-chain.
    *   `registerIdentity(bytes calldata _encryptionKey)`: Registers/updates a user's E2EE public key.
    *   `getEncryptionKey(address _user)`: Retrieves a user's registered public key.
*   **Wallet Compatibility**: Supports widely used wallets like MetaMask, WalletConnect, Coinbase Wallet, and Phantom (Solana).

---

## 🧪 Testing & Quality Assurance

The project includes various testing and quality assurance mechanisms to ensure reliability, correctness, and maintainability:

*   **Smart Contract Tests**: Comprehensive tests for `ChatRegistry.sol` using Hardhat, Mocha, and Chai ensure contract logic is sound and secure.
*   **Code Linting**: The project uses `npm run lint` across all workspaces to maintain code quality and consistency.
*   **Unit & Integration Tests**: (Further details on specific unit/integration test frameworks for frontend and backend could be added here if implemented, e.g., Jest/React Testing Library for frontend, Mocha/Chai for backend API endpoints.)

---

## 🚀 Deployment

The monorepo structure facilitates independent deployment of its components:

*   **Backend (`apps/server`)**: Can be deployed to any Node.js compatible environment (e.g., Vercel, Render, AWS, Google Cloud). Requires MongoDB and Cloudflare R2 configurations.
*   **Frontend (`apps/web`)**: Designed for deployment as a Next.js application (e.g., Vercel, Netlify). Can also be bundled into native Android/iOS apps using Capacitor.
*   **Smart Contracts (`packages/contracts-solidity`)**: Deployed to the Ethereum Sepolia Testnet.

---

## ✍️ Author

**[Your Name/Alias]**
*   **GitHub**: [Your GitHub Profile Link]
*   **LinkedIn**: [Your LinkedIn Profile Link]
*   **Portfolio/Website**: [Your Personal Website/Portfolio Link]
*   **Email**: [Your Email Address]

---

## 📜 Full Documentation & API Reference

For detailed API endpoints, database schemas, and in-depth architectural explanations, please refer to the comprehensive documentation within this `README.md` itself or `documentation.md` for internal development notes.

---

## 🙏 Acknowledgments

*   **Cloudflare R2**: For secure and cost-effective media storage.
*   **Firebase**: For robust push notification services.
*   **The Web3 Ecosystem**: For empowering decentralized applications.
*   **All open-source contributors** and communities behind the libraries and frameworks used.
