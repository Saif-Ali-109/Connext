'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessageSquare, Loader2, ShieldCheck, Key } from 'lucide-react';
import { generateKeyPair, storePrivateKey, validateKeyPair } from '../../lib/crypto';
import { setEncryptedItem, getEncryptedItem } from '../../lib/storage';
import { getApiBaseUrl } from '../../lib/api';

import { useAccount, useSignMessage, useSwitchChain, useDisconnect } from 'wagmi';
import { useWeb3Modal } from '@web3modal/wagmi/react';
import { useChatContract } from '../../hooks/useChatContract';

const SERVER_URL = getApiBaseUrl();

export default function ConnectPageContent() {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'connect' | 'keygen'>('connect');
  const [tempUser, setTempUser] = useState<any>(null);
  const loginInProgress = useRef(false);
  
  const router = useRouter();
  const searchParams = useSearchParams();

  const { isConnected, address: wagmiAddress, chain: activeChain, connector } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const { disconnect } = useDisconnect();
  const { open } = useWeb3Modal();
  const [web3ModalReady, setWeb3ModalReady] = useState(true);

  const chainId = activeChain?.id;
  const EXPECTED_CHAIN_ID = 11155111; // Sepolia

  const isAuthorizationRejected = (err: any) =>
    err?.code === 4001 ||
    /reject|denied|declined/i.test(err?.message || '') ||
    /user rejected/i.test(err?.name || '');

  useEffect(() => {
    setMounted(true);
    console.log('[CONNECT] Component mounted');
  }, []);

  const isOnSepolia = activeChain?.id === EXPECTED_CHAIN_ID;
  const networkName = activeChain?.name || `Chain ID: ${activeChain?.id || 'Unknown'}`;

  useEffect(() => {
    // Only redirect to dashboard if wallet is actually connected
    const storedAddress = getEncryptedItem('auth_address');
    const storedPublicKey = getEncryptedItem('auth_publicKey');
    const hasPrivateKey = storedAddress
      ? !!localStorage.getItem(`chat_priv_${storedAddress.toLowerCase()}`)
      : false;
    
    if (hasPrivateKey && storedPublicKey && isConnected && wagmiAddress?.toLowerCase() === storedAddress?.toLowerCase()) {
      console.log('[CONNECT] Wallet connected and keys present, redirecting to dashboard');
      router.replace('/dashboard');
    }
  }, [router, isConnected, wagmiAddress]);

  const handleAuthSuccess = useCallback(async (user: any) => {
    console.log('[CONNECT] Auth success for:', user.publicAddress);
    const addr = user.publicAddress.toLowerCase();

    const storedPrivateKey = localStorage.getItem(`chat_priv_${addr}`);
    
    // Verify the key pair is valid for THIS specific user
    const hasMatchingKeyPair = storedPrivateKey && user.publicKey
      ? await validateKeyPair(user.publicKey, storedPrivateKey)
      : false;
    
    if (!user.publicKey || !storedPrivateKey || !hasMatchingKeyPair) {
      setTempUser(user);
      setStep('keygen');
    } else {
      setEncryptedItem('auth_address', user.publicAddress, addr);
      setEncryptedItem('auth_publicKey', user.publicKey, addr);
      setEncryptedItem('auth_user_id', user._id, addr);
      
      // Also set as global active session
      setEncryptedItem('auth_address', user.publicAddress);
      setEncryptedItem('auth_publicKey', user.publicKey);
      setEncryptedItem('auth_user_id', user._id);
      
      const inviteKey = searchParams.get('invite');
      if (inviteKey) {
        router.push(`/invite?key=${inviteKey}`);
      } else {
        router.push('/dashboard');
      }
    }
  }, [router, searchParams]);

  const connectWithMetaMask = async () => {
    if (loading || loginInProgress.current) return;
    loginInProgress.current = true;
    setLoading(true);
    setError(null);
    
    try {
      const { connect, getConnectors } = await import('wagmi/actions');
      const { config } = await import('../../lib/ethereum');
      const connectors = getConnectors(config);
      const metamaskConnector = connectors.find(c => c.id === 'injected' || c.name?.toLowerCase().includes('metamask'));
      if (!metamaskConnector) throw new Error('MetaMask not found');
      
      await connect(config, { connector: metamaskConnector });
    } catch (err: any) {
      setError(err.message || 'Failed to connect to MetaMask');
      loginInProgress.current = false;
      setLoading(false);
    }
  };

  const handleGenerateKeys = async () => {
    console.log('[CONNECT] Generating keys...');
    if (!window.crypto?.subtle) {
      setError('Secure Context Required: Encryption features are blocked by your browser on this network address.');
      return;
    }
    setLoading(true);
    try {
      const keys = await generateKeyPair();
      console.log('[CONNECT] Keys generated successfully');

      // Save public key to server
      console.log('[CONNECT] Saving public key to server...');
      const response = await fetch(`${SERVER_URL}/auth/public-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ publicKey: keys.publicKey }),
      });

      if (!response.ok) throw new Error('Failed to save public key to server');

      storePrivateKey(tempUser.publicAddress, keys.privateKey);
      
      const addr = tempUser.publicAddress.toLowerCase();
      setEncryptedItem('auth_address', tempUser.publicAddress, addr);
      setEncryptedItem('auth_publicKey', keys.publicKey, addr);
      setEncryptedItem('auth_user_id', tempUser._id, addr);
      
      // Also set as global active session for convenience
      setEncryptedItem('auth_address', tempUser.publicAddress);
      setEncryptedItem('auth_publicKey', keys.publicKey);
      setEncryptedItem('auth_user_id', tempUser._id);
      
      router.push('/dashboard');
    } catch (err: any) {
      console.error('[CONNECT] Key generation error:', err);
      setError(err.message || 'Key generation failed');
    } finally {
      setLoading(false);
    }
  };


  const loginWithWagmi = useCallback(async () => {
    if (!wagmiAddress || !isConnected || loading || loginInProgress.current) {
      console.log('[CONNECT] Login check:', { wagmiAddress, isConnected, loading, inProgress: loginInProgress.current });
      return;
    }
    
    loginInProgress.current = true;
    setLoading(true);
    setError(null);

    // 1. Handle Chain Switching
    if (chainId !== EXPECTED_CHAIN_ID) {
        console.log(`[CONNECT] Wrong chain: ${chainId}. Switching to ${EXPECTED_CHAIN_ID}...`);
        try {
        await switchChainAsync({ chainId: EXPECTED_CHAIN_ID });
        // Give it a moment after switch before proceeding
        await new Promise(resolve => setTimeout(resolve, 1000));
        setLoading(false);
        loginInProgress.current = false;
        return; 
      } catch (e: any) {
        console.error('[CONNECT] Chain switch failed:', e);
        setError('Please switch to Sepolia network in your wallet.');
        setLoading(false);
        loginInProgress.current = false;
        return;
      }
    }

      console.log('[CONNECT] Starting login process on Sepolia...');
    try {
      const publicAddress = wagmiAddress;
      const connectorName = connector?.name?.toLowerCase() || '';
      const walletType = connectorName.includes('metamask') ? 'metamask' : 'walletconnect';

      console.log(`[AUTH] Requesting nonce for ${publicAddress} (${walletType})...`);
      console.log(`[AUTH] Server URL: ${SERVER_URL}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      try {
        // Fetch nonce and handle response
        const nonceResponse = await fetch(`${SERVER_URL}/auth/nonce`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ publicAddress, walletType, chainId: EXPECTED_CHAIN_ID }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (!nonceResponse || !nonceResponse.ok) {
          const errorData = nonceResponse ? await nonceResponse.json().catch(() => ({})) : {};
          throw new Error(errorData.error || `Server error (Status: ${nonceResponse?.status || 'Unknown'})`);
        }
        const { nonce } = await nonceResponse.json();
        console.log('[CONNECT] Nonce received:', nonce);

        const msg = `I am signing my one-time nonce: ${nonce}`;
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log('[CONNECT] Requesting signature via', connectorName);
        
        const signaturePromise = signMessageAsync({ message: msg });
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Signature request timed out. Please open your wallet app and try again.')), 30000)
        );
        
        const signature = await Promise.race([signaturePromise, timeoutPromise]) as string;
        console.log('[CONNECT] Signature obtained');

        // Fetch verification and handle response
        console.log(`[AUTH] Requesting verification from ${SERVER_URL}/auth/verify...`);
        const verifyResponse = await fetch(`${SERVER_URL}/auth/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ publicAddress, signature, walletType, chainId: EXPECTED_CHAIN_ID }),
        });
        
        if (!verifyResponse || !verifyResponse.ok) {
          const errorData = verifyResponse ? await verifyResponse.json().catch(() => ({})) : {};
          throw new Error(errorData.error || 'Signature verification failed');
        }
        const data = await verifyResponse.json();
        console.log('[CONNECT] Verification success');
        
        if (data.user) {
          await handleAuthSuccess(data.user);
        } else {
          throw new Error('No user data returned from server');
        }
      } catch (fetchErr: any) {
        if (fetchErr.name === 'AbortError') {
          throw new Error(`Connection to ${SERVER_URL} timed out. Is the server running?`);
        }
        if (fetchErr.message === 'Failed to fetch' || fetchErr.name === 'TypeError') {
          throw new Error(`NetworkError: Failed to reach ${SERVER_URL}. Check your internet connection and ensure the backend server is running.`);
        }
        throw fetchErr;
      }
    } catch (err: any) {
      console.error('[DEBUG] Login error details:', {
        message: err.message,
        name: err.name,
        code: err.code,
        stack: err.stack
      });
        if (isAuthorizationRejected(err)) {
          setError('Wallet connection cancelled. Click "Connect Wallet" below to try again.');
        }
    } finally {
      setLoading(false);
      loginInProgress.current = false;
    }
  }, [wagmiAddress, isConnected, loading, chainId, connector, switchChainAsync, signMessageAsync, handleAuthSuccess, SERVER_URL]);

  const autoLoginAttempted = useRef(false);

  // Reset auto-login flag when disconnected
  useEffect(() => {
    if (!isConnected) {
      autoLoginAttempted.current = false;
    }
  }, [isConnected]);

  // Automatically trigger sign-in when wallet connects
  useEffect(() => {
    // Only auto-login if on 'connect' step, no errors exist, and we haven't already attempted it
    if (mounted && isConnected && wagmiAddress && !loading && !loginInProgress.current && step === 'connect' && !error && !autoLoginAttempted.current) {
      console.log('[CONNECT] Wallet connected. Automatically starting sign-in process.');
      autoLoginAttempted.current = true;
      loginWithWagmi();
    }
  }, [isConnected, wagmiAddress, mounted, loginWithWagmi, loading, step, error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-background-primary text-text-primary font-sans transition-colors">
      <div className="z-10 w-full max-w-lg p-8 bg-background-secondary border border-border rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex flex-col items-center mb-8">
          <div className="p-3 bg-accent rounded-2xl mb-4">
            <MessageSquare className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-accent to-purple-600">
            Wallet Chat
          </h1>
          <p className="text-text-secondary mt-2">Secure, encrypted wallet-to-wallet messaging</p>
        </div>

        {step === 'connect' ? (
          <div className="space-y-6">
            <div className="text-center space-y-2 mb-6">
              <h2 className="text-xl font-semibold text-text-primary">Connect your wallet</h2>
              <p className="text-sm text-text-muted">Choose a wallet to sign in and start chatting</p>
              </div>

              {activeChain && (
                <div className={`text-xs font-medium px-3 py-1.5 rounded-full inline-block mx-auto ${
                  isOnSepolia ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  {isOnSepolia ? '✓ Sepolia Network' : `⚠ ${networkName}`}
                </div>
              )}

            <div className="grid grid-cols-1 gap-4">
              <div className="flex flex-col gap-4">
                {!isConnected ? (
                  <div className="flex flex-col gap-4">
                    <button
                      onClick={async () => {
                        try {
                          await disconnect();
                        } catch (e) {}
                        
                        // Open Web3Modal to let user choose their wallet (MetaMask, WalletConnect, etc)
                        try {
                          await open();
                        } catch (e) {
                          console.error('Failed to open Web3Modal', e);
                          setError('Popup blocked or Web3Modal failed to open. Please allow popups for this site and try again.');
                        }
                      }}
                      disabled={loading}
                      className="w-full bg-[#3498db] hover:bg-[#2980b9] text-white font-bold py-4 rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2"
                    >
                      <Key className="w-5 h-5" />
                      Connect Wallet
                    </button>
                    
                    <div className="text-center text-xs text-text-muted">or</div>
                    
                    <button
                      onClick={connectWithMetaMask}
                      disabled={loading}
                      className="w-full bg-[#f6851a] hover:bg-[#e2761b] text-white font-bold py-4 rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2"
                    >
                      <Key className="w-5 h-5" />
                      Connect MetaMask Directly
                    </button>
                    
                    <button
                      onClick={async () => {
                        try {
                          await disconnect();
                        } catch (e) {}
                        localStorage.clear();
                        window.location.reload();
                      }}
                      className="text-xs text-text-muted hover:text-red-500 transition-colors py-2 text-center"
                    >
                      Stuck? Click here to Reset Session
                    </button>
                    
                    {isConnected && !loading && (
                       <button
                         onClick={() => disconnect()}
                         className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-bold py-2 rounded-xl transition-all"
                       >
                         Disconnect Wallet
                       </button>
                    )}
                    
                    <button
                      onClick={async () => {
                        try {
                          await disconnect();
                        } catch (e) {}
                        localStorage.clear();
                        // Wait a moment for clear to propagate
                        await new Promise(r => setTimeout(r, 1000));
                        window.location.reload();
                      }}
                      className="text-xs text-text-muted hover:text-red-500 transition-colors py-2 text-center"
                    >
                      Stuck? Click here to Reset Session
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={loginWithWagmi}
                      disabled={loading}
                      className="w-full bg-accent hover:opacity-90 text-white font-bold py-4 rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="animate-spin w-5 h-5" />
                          <span>Signing In...</span>
                        </>
                      ) : 'Sign In with Wallet'}
                    </button>
                    
                    {loading && (
                      <button
                        onClick={() => {
                          disconnect();
                          localStorage.clear();
                          window.location.reload();
                        }}
                        className="text-xs text-text-muted hover:text-red-500 transition-colors py-2"
                      >
                        Taking too long? Click here to reset session
                      </button>
                    )}
                  </div>
                )}

                {/* Skip to Dashboard removed as per request */}

                {isConnected && !loading && (
                   <button
                   onClick={() => disconnect()}
                   className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-bold py-2 rounded-xl transition-all"
                 >
                   Disconnect Wallet
                 </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-green-900/30 text-green-500 rounded-full flex items-center justify-center mx-auto">
                <ShieldCheck className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold text-text-primary">Secure Your Chat</h2>
              <p className="text-text-secondary">
                To enable end-to-end encryption, we need to generate a secure key pair for your wallet.
              </p>
              <div className="bg-accent/10 border border-accent/20 p-4 rounded-xl text-left">
                <div className="flex gap-3">
                  <Key className="w-5 h-5 text-accent shrink-0" />
                  <p className="text-xs text-text-secondary leading-relaxed">
                    Your public key will be shared with others. Your private key will <span className="font-bold underline">never</span> leave your browser.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={handleGenerateKeys}
              disabled={loading}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" /> : 'Generate & Secure'}
            </button>
          </div>
        )}

        {error && (
          <div className="mt-6 p-4 bg-red-900/30 border border-red-800 text-red-400 rounded-xl text-sm flex flex-col gap-3">
            <p className="font-medium text-center">Connection Error</p>
            <p className="opacity-80">{error}</p>
            
            <div className="grid grid-cols-1 gap-2">
              <button 
                onClick={() => {
                  setError(null);
                  loginWithWagmi();
                }}
                className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-xl transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
              >
                Retry Login
              </button>
              
              <button 
                onClick={() => {
                  disconnect();
                  localStorage.clear();
                  window.location.reload();
                }}
                className="w-full bg-background-tertiary hover:bg-red-500/20 text-text-secondary hover:text-red-400 font-medium py-2 rounded-xl border border-border transition-all text-xs"
              >
                Hard Reset & Reconnect
              </button>
            </div>
          </div>
        ) }
      </div>
      
      <div className="mt-8 text-xs text-text-muted font-medium">
        &copy; 2026 Wallet Chat Protocol • Fully Encrypted
      </div>
    </main>
  );
}
