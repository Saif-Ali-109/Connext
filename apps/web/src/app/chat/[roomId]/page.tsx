import ChatClient from '../ChatClient';
import { Suspense } from 'react';
import { Spinner } from '../../../components/ui/motion';

export default function ChatRoomPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex flex-col items-center justify-center p-8 min-h-screen bg-background-primary">
          <Spinner className="w-10 h-10" />
        </div>
      }
    >
      <ChatClient />
    </Suspense>
  );
}
