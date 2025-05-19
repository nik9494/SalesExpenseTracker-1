import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { RoomCard } from "@/components/lobby/RoomCard";
import { BonusRoomCard } from "@/components/lobby/BonusRoomCard";
import { HeroRoomCard } from "@/components/lobby/HeroRoomCard";
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

export default function HomePage() {
  const { telegramUser } = useTelegram();
  
  // Fetch rooms
  const { data: roomsData, isLoading: roomsLoading } = useQuery({
    queryKey: ['/api/v1/rooms'],
    enabled: !!telegramUser,
  });
  
  // Fetch user data
  const { data: userData, isLoading: userLoading } = useQuery({
    queryKey: ['/api/v1/users/me'],
    enabled: !!telegramUser,
  });
  
  const user: User | null = userData?.user || null;
  const rooms: Room[] = roomsData?.rooms || [
    // Временные данные для отображения в случае, если нет комнат с сервера
    {
      id: "room1",
      creator_id: "system",
      type: "standard",
      entry_fee: 20,
      max_players: 10,
      status: "waiting",
      created_at: new Date(),
      participants_count: 4
    },
    {
      id: "room2",
      creator_id: "system",
      type: "standard",
      entry_fee: 50,
      max_players: 10,
      status: "waiting",
      created_at: new Date(),
      participants_count: 2
    },
    {
      id: "room3",
      creator_id: "system",
      type: "standard",
      entry_fee: 100,
      max_players: 10,
      status: "waiting",
      created_at: new Date(),
      participants_count: 6
    },
    {
      id: "room4",
      creator_id: "system",
      type: "standard",
      entry_fee: 200,
      max_players: 10,
      status: "waiting",
      created_at: new Date(),
      participants_count: 1
    }
  ];
  const isLoading = roomsLoading || userLoading;
  
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
          // Loading state
          Array(6).fill(0).map((_, i) => (
            <div 
              key={i}
              className="bg-gray-100 rounded-xl shadow-md p-3 animate-pulse h-32"
            ></div>
          ))
        ) : (
          <>
            {/* Standard Rooms */}
            {rooms.filter(room => room.type === "standard").map(room => (
              <RoomCard 
                key={room.id} 
                room={room} 
                userBalance={user?.balance_stars || 0} 
              />
            ))}
            
            {/* Убираем Hero Room с главной страницы - она должна создаваться только через страницу Create */}
          </>
        )}
      </div>
    </>
  );
}
