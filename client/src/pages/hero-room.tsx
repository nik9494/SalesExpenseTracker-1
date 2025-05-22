import { useState } from "react";
import { useLocation } from "wouter";
import { Header } from "@/components/layout/Header";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { showError } from "@/lib/telegram";
import { useTranslation } from 'react-i18next';

export default function HeroRoomPage() {
  const [, navigate] = useLocation();
  const [roomCode, setRoomCode] = useState("");
  const { t, i18n } = useTranslation();
  
  // Fetch active hero rooms
  const { data, isLoading } = useQuery({
    queryKey: ['/api/v1/rooms/hero'],
  });
  
  const heroRooms = data?.rooms || [];
  
  // Handle create hero room
  const handleCreateHeroRoom = () => {
    navigate("/create-hero-room");
  };
  
  // Handle join room by code
  const handleJoinHeroRoom = async () => {
    if (!roomCode || roomCode.length !== 6) {
      showError("Please enter a valid 6-character room code");
      return;
    }
    
    try {
      const response = await apiRequest('GET', `/api/v1/rooms/hero/${roomCode}`);
      const data = await response.json();
      if (data.room) {
        navigate(`/waiting-room/${data.room.id}`);
      }
    } catch (error) {
      showError("Room not found or cannot be joined");
    }
  };
  
  // Handle join room from list
  const handleJoinRoom = (roomId: string) => {
    navigate(`/waiting-room/${roomId}`);
  };
  
  return (
    <>
      <Header 
        title={t('hero_room')}
      />
      
      <div className="p-6">
        <div className="grid grid-cols-1 gap-5">
          {/* Create Room Card */}
          <div className="bg-white rounded-xl shadow-md p-5 border border-amber-200">
            <div className="flex items-center mb-4">
              <div className="bg-amber-500 text-white p-2 rounded-lg mr-3">
                <i className="fas fa-plus"></i>
              </div>
              <h2 className="text-lg font-semibold">{t('create_hero_room')}</h2>
            </div>
            
            <p className="text-sm text-telegram-gray-600 mb-4">
              {t('create_hero_room_description')}
            </p>
            
            <button 
              className="bg-amber-500 text-white py-2 w-full rounded-lg text-sm font-medium"
              onClick={handleCreateHeroRoom}
            >
              {t('create_room')}
            </button>
          </div>
          
          {/* Join Room Card */}
          <div className="bg-white rounded-xl shadow-md p-5 border border-telegram-gray-200">
            <div className="flex items-center mb-4">
              <div className="bg-[#0088CC] text-white p-2 rounded-lg mr-3">
                <i className="fas fa-sign-in-alt"></i>
              </div>
              <h2 className="text-lg font-semibold">{t('join_hero_room')}</h2>
            </div>
            
            <p className="text-sm text-telegram-gray-600 mb-4">
              {t('enter_room_code')}
            </p>
            
            <div className="mb-4">
              <input 
                type="text" 
                placeholder={t('enter_room_code_placeholder')} 
                className="w-full px-4 py-2 border border-telegram-gray-300 rounded-lg text-center text-lg font-medium tracking-wider uppercase" 
                maxLength={6}
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              />
            </div>
            
            <button 
              className="bg-[#0088CC] text-white py-2 w-full rounded-lg text-sm font-medium"
              onClick={handleJoinHeroRoom}
            >
              {t('join_room')}
            </button>
          </div>
          
          {/* Active Hero Rooms */}
          <div className="bg-white rounded-xl shadow-md border border-telegram-gray-200 overflow-hidden">
            <div className="bg-telegram-gray-100 py-3 px-4 border-b border-telegram-gray-200">
              <h3 className="font-medium">{t('active_hero_rooms')}</h3>
            </div>
            
            <div className="divide-y divide-telegram-gray-200">
              {isLoading ? (
                Array(2).fill(0).map((_, i) => (
                  <div key={i} className="p-3 animate-pulse">
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded-full bg-gray-200 mr-3"></div>
                      <div className="flex-1">
                        <div className="h-5 bg-gray-200 rounded w-24 mb-1"></div>
                        <div className="h-3 bg-gray-200 rounded w-32"></div>
                      </div>
                      <div className="w-12 h-8 bg-gray-200 rounded-full"></div>
                    </div>
                  </div>
                ))
              ) : heroRooms.length === 0 ? (
                <div className="p-4 text-center text-sm text-telegram-gray-500">
                  {t('no_active_hero_rooms')}
                </div>
              ) : (
                heroRooms.map((room) => (
                  <div key={room.id} className="p-3 flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded-full overflow-hidden mr-3 border border-amber-300">
                        <img 
                          src={room.creator?.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(room.creator?.username || 'Creator')}&background=random`}
                          alt="Creator" 
                          className="w-full h-full object-cover" 
                        />
                      </div>
                      <div>
                        <div className="font-medium">{t('room')}: {room.code}</div>
                        <div className="text-xs text-telegram-gray-600 flex items-center">
                          <i className="fas fa-users mr-1"></i> {room.participants_count}/{room.max_players} • 
                          <i className="fas fa-star text-yellow-400 mx-1"></i> {room.entry_fee}
                        </div>
                      </div>
                    </div>
                    <button 
                      className="bg-[#0088CC] text-white text-xs py-1.5 px-3 rounded-full"
                      onClick={() => handleJoinRoom(room.id)}
                    >
                      {t('join')}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
