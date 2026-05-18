'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import {
  UserPlus, Loader2, Check, X, MessageSquare,
  Search, Clock, Users, Send, Copy, ChevronRight,
  AlertCircle, RefreshCw, Shield, Wallet
} from 'lucide-react';
import Navigation from '../../components/Navigation';
import { getEncryptedItem } from '../../lib/storage';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4001';
const theme = {
  bgPrimary: 'var(--bg-primary)',
  bgSecondary: 'var(--bg-secondary)',
  bgTertiary: 'var(--bg-tertiary)',
  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  border: 'var(--border-color)',
  accent: 'var(--accent-color)',
  accentBgSubtle: 'color-mix(in srgb, var(--accent-color) 8%, transparent)',
  accentBgSoft: 'color-mix(in srgb, var(--accent-color) 15%, transparent)',
  accentBgMedium: 'color-mix(in srgb, var(--accent-color) 20%, transparent)',
  accentBgStrong: 'color-mix(in srgb, var(--accent-color) 30%, transparent)',
  accentBorder: 'color-mix(in srgb, var(--accent-color) 28%, transparent)',
  accentBorderStrong: 'color-mix(in srgb, var(--accent-color) 44%, transparent)',
};

interface User {
  _id: string;
  publicAddress: string;
  username?: string;
  displayName?: string;
}

interface Contact {
  _id: string;
  from: User;
  to: User;
  fromWallet: string;
  toWallet: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt?: string;
}

type Tab = 'incoming' | 'outgoing' | 'contacts';

function shortenAddress(addr: string) {
  if (!addr) return '';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function getRoomIdFromContact(contact: Contact, currentUserId: string | null) {
  return [contact.fromWallet.toLowerCase().trim(), contact.toWallet.toLowerCase().trim()].sort().join('-');
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text);
}

function TimeAgo({ date }: { date?: string }) {
  if (!date) return null;
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  const label = days > 0 ? `${days}d ago` : hours > 0 ? `${hours}h ago` : mins > 0 ? `${mins}m ago` : 'just now';
  return <span className="text-xs" style={{ color: theme.textMuted }}>{label}</span>;
}

function Avatar({ address, size = 40 }: { address: string; size?: number }) {
  const colors = ['#00ff87', '#00e5ff', '#ff6b6b', '#ffd700', '#a78bfa', '#fb923c'];
  const color = colors[parseInt(address?.slice(2, 4) || '0', 16) % colors.length];
  const letter = address ? address.slice(2, 3).toUpperCase() : '?';
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `${color}22`,
      border: `2px solid ${color}44`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 700, color, flexShrink: 0,
      fontFamily: 'monospace'
    }}>
      {letter}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; bg: string; label: string }> = {
    pending: { color: '#ffd700', bg: '#ffd70015', label: 'Pending' },
    accepted: { color: '#00ff87', bg: '#00ff8715', label: 'Accepted' },
    rejected: { color: '#ff6b6b', bg: '#ff6b6b15', label: 'Rejected' },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px',
      borderRadius: 20, color: s.color, background: s.bg,
      border: `1px solid ${s.color}33`, letterSpacing: '0.05em'
    }}>
      {s.label}
    </span>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const map = {
    incoming: { icon: <UserPlus size={40} />, text: 'No incoming requests', sub: 'When someone sends you a chat request it will appear here' },
    outgoing: { icon: <Send size={40} />, text: 'No outgoing requests', sub: 'Search for a public address, wallet address, or public key above to send a request' },
    contacts: { icon: <Users size={40} />, text: 'No contacts yet', sub: 'Accept chat requests to add contacts' },
  };
  const { icon, text, sub } = map[tab];
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <div style={{ color: theme.textMuted, marginBottom: 16 }}>{icon}</div>
      <p style={{ color: theme.textSecondary, fontWeight: 600, marginBottom: 8 }}>{text}</p>
      <p style={{ color: theme.textMuted, fontSize: 13 }}>{sub}</p>
    </div>
  );
}

function RequestsContent() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('incoming');
  const [incoming, setIncoming] = useState<Contact[]>([]);
  const [outgoing, setOutgoing] = useState<Contact[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState<User | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const storedUserId = getEncryptedItem('auth_user_id');
    const storedToken = getEncryptedItem('auth_token') || localStorage.getItem('auth_token');
    if (!storedUserId) { router.push('/connect'); return; }
    setUserId(storedUserId);
    setToken(storedToken);
  }, [router]);

  const getHeaders = () => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  const fetchRequests = async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${SERVER_URL}/chat/requests`, {
        credentials: 'include',
        headers: getHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch requests');
      setIncoming(data.incoming || []);
      setOutgoing(data.outgoing || []);
      setContacts(data.contacts || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (userId) fetchRequests(); }, [userId]);

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleSearch = async () => {
    const query = searchQuery.trim();
    if (!query) return;
    setSearching(true);
    setSearchError(null);
    setSearchResult(null);
    try {
      // Search by public address, wallet address, or public key
      const res = await fetch(
        `${SERVER_URL}/auth/user/${encodeURIComponent(query)}`,
        { credentials: 'include', headers: getHeaders() }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'User not found. Check the public address, wallet address, or public key.');
      setSearchResult(data.user);
    } catch (err: any) {
      setSearchError(err.message || 'User not found. Check the public address, wallet address, or public key.');
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async () => {
    if (!searchResult) return;
    setSendingRequest(true);
    setSearchError(null);
    try {
      const res = await fetch(`${SERVER_URL}/chat/request`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({
          fromUserId: userId,
          toPublicKey: searchResult.publicAddress || searchResult._id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send request');
      showSuccess('Chat request sent successfully!');
      setSearchQuery('');
      setSearchResult(null);
      fetchRequests();
      setActiveTab('outgoing');
    } catch (err: any) {
      setSearchError(err.message);
    } finally {
      setSendingRequest(false);
    }
  };

  const handleRespond = async (requestId: string, status: 'accepted' | 'rejected') => {
    setActionLoading(requestId + status);
    try {
      const res = await fetch(`${SERVER_URL}/chat/respond`, {
        method: 'POST',
        credentials: 'include',
        headers: getHeaders(),
        body: JSON.stringify({ requestId, status }),
      });
      if (!res.ok) throw new Error('Action failed');
      showSuccess(status === 'accepted' ? 'Request accepted!' : 'Request rejected');
      fetchRequests();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenChat = (contact: Contact) => {
    router.push(`/chat/${getRoomIdFromContact(contact, userId)}`);
  };

  const handleCopy = (text: string) => {
    copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tabs: { id: Tab; label: string; count: number; icon: React.ReactNode }[] = [
    { id: 'incoming', label: 'Incoming', count: incoming.filter(r => r.status === 'pending').length, icon: <UserPlus size={14} /> },
    { id: 'outgoing', label: 'Sent', count: outgoing.length, icon: <Send size={14} /> },
    { id: 'contacts', label: 'Contacts', count: contacts.length, icon: <Users size={14} /> },
  ];

  const currentList = activeTab === 'incoming' ? incoming : activeTab === 'outgoing' ? outgoing : contacts;

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: theme.accentBgSoft, border: `1px solid ${theme.accentBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Shield size={18} color={theme.accent} />
            </div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: theme.textPrimary, fontFamily: 'monospace', letterSpacing: '-0.02em' }}>
                Chat Requests
              </h1>
              <p style={{ fontSize: 12, color: theme.textMuted }}>Manage your wallet connections</p>
            </div>
          </div>
          <button
            onClick={fetchRequests}
            style={{
              background: 'transparent', border: `1px solid ${theme.border}`,
              borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
              color: theme.textMuted, display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, transition: 'all 0.2s'
            }}
            onMouseOver={e => (e.currentTarget.style.borderColor = theme.accentBorderStrong)}
            onMouseOut={e => (e.currentTarget.style.borderColor = theme.border)}
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      </div>

      {/* Search Box */}
      <div style={{
        background: theme.bgSecondary, border: `1px solid ${theme.border}`,
        borderRadius: 16, padding: 20, marginBottom: 24,
        boxShadow: '0 4px 24px rgba(0,0,0,0.12)'
      }}>
        <p style={{ fontSize: 12, color: theme.textMuted, marginBottom: 10, fontFamily: 'monospace', letterSpacing: '0.05em' }}>
          FIND USER
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} color={theme.textMuted} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSearchResult(null); setSearchError(null); }}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Enter public address, wallet address, or public key..."
              style={{
                width: '100%', padding: '10px 12px 10px 36px',
                background: theme.bgTertiary, border: `1px solid ${theme.border}`,
                borderRadius: 10, color: theme.textPrimary, fontSize: 14,
                outline: 'none', fontFamily: 'monospace',
                boxSizing: 'border-box', transition: 'border-color 0.2s'
              }}
              onFocus={e => (e.target.style.borderColor = theme.accentBorderStrong)}
              onBlur={e => (e.target.style.borderColor = theme.border)}
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
            style={{
              padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
              background: searching ? theme.bgTertiary : theme.accentBgMedium,
              border: `1px solid ${theme.accentBorderStrong}`,
              color: theme.accent, fontWeight: 700, fontSize: 14,
              display: 'flex', alignItems: 'center', gap: 6,
              transition: 'all 0.2s', whiteSpace: 'nowrap',
              opacity: !searchQuery.trim() ? 0.5 : 1
            }}
          >
            {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Search Error */}
        {searchError && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 10,
            background: '#ff6b6b10', border: '1px solid #ff6b6b33',
            display: 'flex', alignItems: 'center', gap: 8
          }}>
            <AlertCircle size={14} color="#ff6b6b" />
            <p style={{ color: '#ff6b6b', fontSize: 13 }}>{searchError}</p>
          </div>
        )}

        {/* Search Result */}
        {searchResult && (
          <div style={{
            marginTop: 14, padding: 16, borderRadius: 12,
            background: theme.accentBgSubtle, border: `1px solid ${theme.accentBorder}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 12, flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar address={searchResult.publicAddress} size={44} />
              <div>
                <p style={{ color: theme.textPrimary, fontWeight: 700, marginBottom: 2 }}>
                  {searchResult.displayName || searchResult.username || 'Anonymous User'}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Wallet size={11} color={theme.textMuted} />
                  <span style={{ fontSize: 12, color: theme.textMuted, fontFamily: 'monospace' }}>
                    {shortenAddress(searchResult.publicAddress)}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={handleSendRequest}
              disabled={sendingRequest}
              style={{
                padding: '10px 20px', borderRadius: 10, cursor: 'pointer',
                background: theme.accentBgMedium, border: `1px solid ${theme.accentBorderStrong}`,
                color: theme.accent, fontWeight: 700, fontSize: 13,
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.2s'
              }}
              onMouseOver={e => (e.currentTarget.style.background = theme.accentBgStrong)}
              onMouseOut={e => (e.currentTarget.style.background = theme.accentBgMedium)}
            >
              {sendingRequest ? <Loader2 size={14} /> : <UserPlus size={14} />}
              {sendingRequest ? 'Sending...' : 'Send Request'}
            </button>
          </div>
        )}
      </div>

      {/* Success Toast */}
      {success && (
        <div style={{
          marginBottom: 16, padding: '12px 16px', borderRadius: 10,
          background: theme.accentBgSoft, border: `1px solid ${theme.accentBorder}`,
          display: 'flex', alignItems: 'center', gap: 8
        }}>
          <Check size={14} color={theme.accent} />
          <p style={{ color: theme.accent, fontSize: 13, fontWeight: 600 }}>{success}</p>
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div style={{
          marginBottom: 16, padding: '12px 16px', borderRadius: 10,
          background: '#ff6b6b10', border: '1px solid #ff6b6b33',
          display: 'flex', alignItems: 'center', gap: 8
        }}>
          <AlertCircle size={14} color="#ff6b6b" />
          <p style={{ color: '#ff6b6b', fontSize: 13 }}>{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 20,
        background: theme.bgSecondary, border: `1px solid ${theme.border}`,
        borderRadius: 12, padding: 4
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 9,
              border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'all 0.2s',
              background: activeTab === tab.id ? theme.accentBgSoft : 'transparent',
              color: activeTab === tab.id ? theme.accent : theme.textMuted,
              borderBottom: activeTab === tab.id ? `1px solid ${theme.accentBorder}` : '1px solid transparent',
            }}
          >
            {tab.icon}
            {tab.label}
            {tab.count > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 800, padding: '1px 6px',
                borderRadius: 20, minWidth: 18, textAlign: 'center',
                background: activeTab === tab.id ? theme.accentBgStrong : theme.bgTertiary,
                color: activeTab === tab.id ? theme.accent : theme.textMuted,
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 60, gap: 10 }}>
          <Loader2 size={20} color={theme.accent} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ color: theme.textMuted, fontSize: 14 }}>Loading...</span>
        </div>
      ) : currentList.length === 0 ? (
        <EmptyState tab={activeTab} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {currentList.map(req => {
            const isFromMe = req.from._id === userId || req.fromWallet === userId;
            const otherUser = isFromMe ? req.to : req.from;
            const isActionLoading = (s: string) => actionLoading === req._id + s;

            return (
              <div
                key={req._id}
                style={{
                  background: theme.bgSecondary, border: `1px solid ${theme.border}`,
                  borderRadius: 14, padding: 16, transition: 'border-color 0.2s',
                }}
                onMouseOver={e => (e.currentTarget.style.borderColor = theme.accentBorder)}
                onMouseOut={e => (e.currentTarget.style.borderColor = theme.border)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <Avatar address={otherUser?.publicAddress || ''} size={46} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ color: theme.textPrimary, fontWeight: 700, fontSize: 15 }}>
                        {otherUser?.displayName || otherUser?.username || 'Anonymous'}
                      </span>
                      <StatusBadge status={req.status} />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Wallet size={11} color={theme.textMuted} />
                      <span style={{ fontSize: 12, color: theme.textMuted, fontFamily: 'monospace' }}>
                        {shortenAddress(otherUser?.publicAddress || '')}
                      </span>
                      <button
                        onClick={() => handleCopy(otherUser?.publicAddress || '')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: theme.textMuted }}
                        title="Copy address"
                      >
                        <Copy size={11} />
                      </button>
                      <TimeAgo date={req.createdAt} />
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {activeTab === 'incoming' && req.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleRespond(req._id, 'accepted')}
                          disabled={!!actionLoading}
                          style={{
                            padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                            background: theme.accentBgSoft, border: `1px solid ${theme.accentBorderStrong}`,
                            color: theme.accent, fontWeight: 700, fontSize: 13,
                            display: 'flex', alignItems: 'center', gap: 5,
                            transition: 'all 0.2s', opacity: actionLoading ? 0.6 : 1
                          }}
                        >
                          {isActionLoading('accepted') ? <Loader2 size={13} /> : <Check size={13} />}
                          Accept
                        </button>
                        <button
                          onClick={() => handleRespond(req._id, 'rejected')}
                          disabled={!!actionLoading}
                          style={{
                            padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                            background: '#ff6b6b10', border: '1px solid #ff6b6b33',
                            color: '#ff6b6b', fontWeight: 700, fontSize: 13,
                            display: 'flex', alignItems: 'center', gap: 5,
                            transition: 'all 0.2s', opacity: actionLoading ? 0.6 : 1
                          }}
                        >
                          {isActionLoading('rejected') ? <Loader2 size={13} /> : <X size={13} />}
                          Reject
                        </button>
                      </>
                    )}

                    {activeTab === 'contacts' && (
                      <button
                        onClick={() => handleOpenChat(req)}
                        style={{
                          padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
                          background: theme.accentBgMedium, border: `1px solid ${theme.accentBorder}`,
                          color: theme.accent, fontWeight: 700, fontSize: 13,
                          display: 'flex', alignItems: 'center', gap: 5,
                          transition: 'all 0.2s'
                        }}
                        onMouseOver={e => (e.currentTarget.style.background = theme.accentBgStrong)}
                        onMouseOut={e => (e.currentTarget.style.background = theme.accentBgMedium)}
                      >
                        <MessageSquare size={13} />
                        Chat
                        <ChevronRight size={13} />
                      </button>
                    )}

                    {activeTab === 'outgoing' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Clock size={13} color={theme.accent} />
                        <span style={{ fontSize: 12, color: theme.accent, fontWeight: 600 }}>Waiting</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function RequestsPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <Navigation />
      <Suspense fallback={
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 80, gap: 10 }}>
          <Loader2 size={22} color={theme.accent} />
          <span style={{ color: theme.textMuted }}>Loading requests...</span>
        </div>
      }>
        <RequestsContent />
      </Suspense>
    </main>
  );
}
