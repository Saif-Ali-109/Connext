import { http, createConfig, fallback } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { walletConnect, injected, coinbaseWallet } from 'wagmi/connectors';
import { Capacitor } from '@capacitor/core';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function readPublicEnv(name: string, fallback: string) {
  const value = process.env[name];
  if (value) return value;

  const message = `Missing ${name}; using a development fallback.`;
  if (process.env.NODE_ENV === 'production') {
    console.error(message);
  } else if (typeof window !== 'undefined') {
    console.warn(message);
  }

  return fallback;
}

export const projectId = readPublicEnv('NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID', 'placeholder-id');

const isNativePlatform = Capacitor.isNativePlatform();

const metadata = {
  name: 'Wallet Chat',
  description: 'E2EE Web3 Chat',
  url: 'https://walletchat.app',
  icons: ['https://avatars.githubusercontent.com/u/37784886'],
  redirect: {
    native: 'walletchat://',
    universal: 'https://walletchat.app',
  },
};

export const getConfig = () => {
  return createConfig({
    chains: [sepolia],
    ssr: false, // We handle SSR by only rendering children when mounted in Web3Provider
    connectors: [
      ...(!isNativePlatform ? [injected({ target: 'metaMask' })] : []),
      walletConnect({ 
        projectId, 
        metadata, 
        showQrModal: false, // Web3Modal handles the UI!
      }),
      coinbaseWallet({
        appName: metadata.name,
      }),
    ],
    transports: {
      [sepolia.id]: fallback([
        http('https://ethereum-sepolia-rpc.publicnode.com'),
        http('https://rpc2.sepolia.org'),
        http('https://eth-sepolia.public.blastapi.io'),
      ]),
    },
  });
};

// For backward compatibility if needed, but we should prefer getConfig()
export const config = getConfig();

export const CHAT_REGISTRY_ADDRESS = readPublicEnv('NEXT_PUBLIC_CHAT_REGISTRY_ADDRESS', ZERO_ADDRESS);
