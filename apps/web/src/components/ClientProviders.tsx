'use client';

import React, { ReactNode } from 'react';
import dynamic from 'next/dynamic';

const Web3Provider = dynamic(() => import('./Web3Provider'), {
  ssr: false,
});

const NotificationManager = dynamic(() => import('./NotificationManager'), { 
  ssr: false 
});

export default function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <Web3Provider>
      <NotificationManager />
      {children}
    </Web3Provider>
  );
}
