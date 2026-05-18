'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Loader2, LogOut, Trash2, Unlink, MessageSquare, Search, Plus, User as UserIcon } from 'lucide-react';
import Navigation from '../../components/Navigation';
import { getEncryptedItem } from '../../lib/storage';
import { clearAuthSession } from '../../lib/storage';
import { useDisconnect } from 'wagmi';
import { clearRoomMessages } from '../../lib/localChatStore';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4001';

interface Contact {
  _id: string;
  from: { _id: string; publicAddress: string; username?: string };
  to: { _id: string; publicAddress: string; username?: string };
  status: string;
  fromCustomName?: string;
  toCustomName?: string;
}

function getRoomId(contact: Contact) {
  return [contact.from.publicAddress.toLowerCase().trim(), contact.to.publicAddress.toLowerCase().trim()].sort().join('-');
}

function DashboardContent() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { disconnect } = useDisconnect();

  useEffect(() => {
    const checkAuth = async () => {
      const storedUserId = getEncryptedItem('auth_user_id');
      const storedAddress = getEncryptedItem('auth_address');
      
      if (!storedUserId || !storedAddress) {
        router.replace('/connect');
        return;
      }

      try {
        const res = await fetch(`${SERVER_URL}/auth/session`, {
          credentials: 'include',
        });
        
        if (!res.ok) {
          clearAuthSession();
          router.replace('/connect');
          return;
        }
        
        setUserId(storedUserId);
        setAddress(storedAddress);
      } catch {
        clearAuthSession();
        router.replace('/connect');
      }
    };
    
    checkAuth();
  }, [router]);

  const fetchContacts = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`${SERVER_URL}/chat/requests`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          clearAuthSession();
          router.push('/connect');
          return;
        }
        throw new Error(data.error || 'Failed');
      }
      setContacts(data.contacts || []);
    } catch (err: any) {
      if (err.message.includes('Unauthorized')) {
        clearAuthSession();
        router.push('/connect');
        return;
      }
      console.error('Failed to fetch contacts:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, router]);

  const fetchUnreadCounts = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`${SERVER_URL}/chat/unreadCounts?userId=${userId}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setUnreadCounts(data || {});
      }
    } catch (err) {
      console.error('Failed to fetch unread counts:', err);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      fetchContacts();
      fetchUnreadCounts();
    }
  }, [userId, fetchContacts, fetchUnreadCounts]);

  const handleEndChat = async (contact: Contact) => {
    setActionBusyId(contact._id + ':end');
    try {
      const res = await fetch(`${SERVER_URL}/chat/request/${contact._id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Failed to end chat');
      }

      clearRoomMessages(contact._id);
      setContacts((current) => current.filter((item) => item._id !== contact._id));
    } catch (error) {
      console.error('Failed to end chat:', error);
    } finally {
      setActionBusyId(null);
    }
  };

  const handleDeleteConversation = (contact: Contact) => {
    const rid = getRoomId(contact);
    clearRoomMessages(rid);
    // Force a small visual feedback or just a silent clear? 
    // Usually users expect a visual indicator, but here we'll just alert for now or trust it works.
  };

  if (loading) return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh]">
      <Loader2 className="w-10 h-10 text-accent animate-spin mb-4" />
      <p className="text-text-secondary font-medium">Loading your conversations...</p>
    </div>
  );

  const activeContacts = contacts.filter(c => c.status === 'accepted');
  const filteredContacts = activeContacts.filter(contact => {
    const isFromMe = contact.from._id === userId;
    const other = isFromMe ? contact.to : contact.from;
    const name = (isFromMe ? contact.fromCustomName : contact.toCustomName) || other.username || other.publicAddress;
    return name?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-text-primary tracking-tight">Messages</h1>
          <p className="text-text-secondary mt-1">Manage your secure conversations</p>
        </div>
        <button
          onClick={() => router.push('/connect')}
          className="bg-accent hover:opacity-90 text-white font-bold py-3 px-6 rounded-2xl transition-all shadow-lg active:scale-95 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          New Chat
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="md:col-span-1 bg-background-secondary border border-border p-6 rounded-3xl shadow-sm">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-accent/10 text-accent rounded-full flex items-center justify-center mb-4 border border-accent/20">
              <Users className="w-8 h-8" />
            </div>
            <p className="text-3xl font-bold text-text-primary">{activeContacts.length}</p>
            <p className="text-sm text-text-muted font-medium uppercase tracking-wider">Active Contacts</p>
          </div>
        </div>
        
        <div className="md:col-span-3 bg-background-secondary border border-border p-6 rounded-3xl shadow-sm flex flex-col justify-center">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input
              type="text"
              placeholder="Search contacts by name or address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-background-tertiary border border-border rounded-2xl py-4 pl-12 pr-4 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all"
            />
          </div>
        </div>
      </div>

      <div className="bg-background-secondary border border-border rounded-3xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border bg-background-tertiary/30">
          <h2 className="text-lg font-bold text-text-primary">Recent Conversations</h2>
        </div>
        
        {filteredContacts.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-20 h-20 bg-background-tertiary rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-10 h-10 text-text-muted" />
            </div>
            <p className="text-text-secondary font-medium">
              {searchQuery ? "No contacts match your search." : "No active conversations yet."}
            </p>
            {!searchQuery && (
              <button 
                onClick={() => router.push('/connect')}
                className="mt-4 text-accent hover:underline font-bold"
              >
                Find someone to chat with
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredContacts.map(contact => {
              const isFromMe = contact.from._id === userId;
              const other = isFromMe ? contact.to : contact.from;
              const unreadCount = unreadCounts[other._id] || 0;
              const customName = isFromMe ? contact.fromCustomName : contact.toCustomName;
              
              return (
                <div key={contact._id} className="group p-4 sm:p-6 hover:bg-background-tertiary/50 transition-all">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <button
                      onClick={() => router.push(`/chat/${getRoomId(contact)}`)}
                      className="flex items-center gap-4 flex-1 min-w-0 text-left"
                    >
                      <div className="relative shrink-0">
                        <div className="w-14 h-14 bg-accent/10 text-accent rounded-full flex items-center justify-center border border-accent/20 font-bold text-xl">
                          {customName ? customName[0].toUpperCase() : (other.username ? other.username[0].toUpperCase() : <UserIcon className="w-6 h-6" />)}
                        </div>
                        {unreadCount > 0 && (
                          <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-6 h-6 rounded-full flex items-center justify-center border-2 border-background-secondary animate-in zoom-in duration-300">
                            {unreadCount}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-lg text-text-primary truncate">
                            {customName || other.username || 'Anonymous Wallet'}
                          </p>
                          {unreadCount > 0 && (
                            <span className="px-2 py-0.5 bg-red-500/10 text-red-500 text-[10px] font-bold rounded-full uppercase tracking-wider">
                              Unread
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-mono text-text-muted truncate">
                          {other.publicAddress}
                        </p>
                      </div>
                    </button>
                    
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        onClick={() => handleDeleteConversation(contact)}
                        className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background-primary px-4 py-2.5 text-sm font-medium text-text-secondary hover:text-red-400 hover:border-red-400/30 transition-all"
                        title="Clear local messages"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span className="sm:hidden lg:inline">Clear</span>
                      </button>
                      <button
                        onClick={() => handleEndChat(contact)}
                        disabled={actionBusyId === contact._id + ':end'}
                        className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-2.5 text-sm font-bold text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-all"
                        title="End chat connection"
                      >
                        {actionBusyId === contact._id + ':end' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />}
                        <span>{actionBusyId === contact._id + ':end' ? 'Ending...' : 'End Chat'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-background-primary text-text-primary">
      <Navigation />
      <Suspense fallback={<div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
        <DashboardContent />
      </Suspense>
    </main>
  );
}
