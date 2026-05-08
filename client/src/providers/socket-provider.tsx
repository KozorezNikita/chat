"use client";

import { createContext, useContext, useEffect } from "react";

import { useMe } from "@/hooks/use-auth";
import { socket, type AppSocket } from "@/lib/socket/client";

/**
 * ============================================
 * SocketProvider
 * ============================================
 *
 * Керує lifecycle WS-з'єднання:
 *  - useMe.user стає не-null → socket.connect()
 *  - useMe.user стає null (logout) → socket.disconnect()
 *  - Component unmount → disconnect (safety net)
 *
 * Не робить нічого з listeners — це робить useSocketEvents() окремо.
 *
 * Provider існує щоб діти могли викликати useSocket() і отримати
 * той самий socket instance (singleton, але якщо колись захочемо
 * decouple — provider це дозволить).
 */

const SocketContext = createContext<AppSocket | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { data } = useMe();
  const userId = data?.user?.id;

  useEffect(() => {
    if (!userId) {
      // Logout або ще не залогінений
      if (socket.connected) socket.disconnect();
      return;
    }

    // Юзер є — connect (якщо ще не connected)
    if (!socket.connected) socket.connect();

    return () => {
      // Cleanup при unmount provider — безпечно disconnect
      // (повторний connect-effect зробить connect знову якщо userId є)
      socket.disconnect();
    };
  }, [userId]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export function useSocket(): AppSocket {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error("useSocket must be used within SocketProvider");
  }
  return ctx;
}
