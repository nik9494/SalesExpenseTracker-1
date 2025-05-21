import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { RoomCard } from "@/components/lobby/RoomCard";
import { BonusRoomCard } from "@/components/lobby/BonusRoomCard";
import { Room } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import { useTelegram } from "@/hooks/useTelegram";

interface User {
  id: string;
  telegram_id: number;
  username: string;
  balance_stars: number;
  has_ton_wallet: boolean;
  photo_url?: string;
}

// --- КОНСТАНТЫ ЦЕН ВХОДА ---
const ENTRY_FEES = [20, 50, 100, 200];

export default function HomePage() {
  const { telegramUser } = useTelegram();
  // Получаем пользователя
  const { data: userData, isLoading: userLoading } = useQuery({
    queryKey: ['/api/v1/users/me'],
    queryFn: async () => {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/v1/users/me', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return response.json();
    },
  });
  const user: User | null = userData?.user || null;

  // Получаем агрегацию по количеству игроков в комнатах с каждой ценой
  const { data: countsData, refetch: refetchCounts, isLoading: countsLoading } = useQuery({
    queryKey: ['/api/v1/rooms/standard-counts'],
    enabled: !!telegramUser && !!localStorage.getItem('token'),
    queryFn: async () => {
      const token = localStorage.getItem('token');
      if (!token) return { counts: {} };
      const response = await fetch('/api/v1/rooms/standard-counts', {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.json();
    },
  });
  const roomCounts: Record<number, number> = countsData?.counts || {};

  // --- АВТОПОДБОР КОМНАТЫ ---
  const [joining, setJoining] = useState<number | null>(null);
  const handleJoinRoom = async (entryFee: number) => {
    if (!user) return;
    setJoining(entryFee);
    try {
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/v1/rooms/auto-join', {
        method: 'POST',
        headers,
        body: JSON.stringify({ entry_fee: entryFee }),
      });
      const data = await res.json();
      if (data.room && data.room.id) {
        window.location.href = `/waiting-room/${data.room.id}`;
      }
    } finally {
      setJoining(null);
      refetchCounts();
    }
  };

  const isLoading = userLoading || countsLoading;

  return (
    <>
      <Header 
        title="Chance Tap"
        rightContent={
          user && (
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full overflow-hidden">
                <img 
                  src={user.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=random`}
                  alt="Profile" 
                  className="w-full h-full object-cover" 
                />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{user.username}</span>
                <div className="flex items-center text-xs text-[#4CAF50] font-medium">
                  <i className="fas fa-star text-yellow-400 mr-1"></i>
                  <span>{user.balance_stars}</span> <span className="ml-1">Stars</span>
                </div>
              </div>
            </div>
          )
        }
      />
      {/* Bonus Room - вверху страницы, перед стандартными комнатами */}
      {!isLoading && (
        <div className="px-4 pt-4">
          <BonusRoomCard bonusAmount={3000} />
        </div>
      )}
      <div className="p-4 grid grid-cols-2 gap-4 pb-20">
        {isLoading ? (
          Array(4).fill(0).map((_, i) => (
            <div 
              key={i}
              className="bg-gray-100 rounded-xl shadow-md p-3 animate-pulse h-32"
            ></div>
          ))
        ) : (
          ENTRY_FEES.map(fee => (
            <div key={fee} onClick={() => handleJoinRoom(fee)} style={{ opacity: joining === fee ? 0.5 : 1, pointerEvents: joining ? 'none' : 'auto' }}>
              <RoomCard
                room={{
                  id: `stub-${fee}`,
                  creator_id: 'system',
                  type: 'standard',
                  entry_fee: fee,
                  max_players: 10,
                  status: 'waiting',
                  created_at: new Date(),
                  participants_count: roomCounts[fee] || 0,
                }}
                userBalance={user?.balance_stars || 0}
              />
            </div>
          ))
        )}
      </div>
    </>
  );
}
