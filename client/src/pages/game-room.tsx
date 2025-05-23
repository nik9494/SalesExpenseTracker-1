import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Header } from "@/components/layout/Header";
import { TapButton } from "@/components/game/TapButton";
import { ProgressBar } from "@/components/game/ProgressBar";
import { formatTime } from "@/lib/utils";
import { useGame } from "@/hooks/useGame";
import { useQuery } from "@tanstack/react-query";
import { Player } from "@shared/types";
import { useTranslation } from 'react-i18next';

export default function GameRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [, navigate] = useLocation();
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isObserver, setIsObserver] = useState<boolean>(false);
  const { t, i18n } = useTranslation();
  
  // Fetch user data
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
  
  const { 
    room, 
    game,
    players, 
    taps, 
    isStarted,
    isFinished,
    remainingTime,
    handleTap
  } = useGame({ 
    roomId, 
    userId: user?.id 
  });
  
  // Fetch room data to check observer status
  const { data: roomData } = useQuery({
    queryKey: ['/api/v1/rooms/' + roomId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/v1/rooms/${roomId}`);
      return response.json();
    },
    onSuccess: (data) => {
      // Проверяем, является ли пользователь наблюдателем
      const participant = data.participants?.find((p: any) => p.user_id === user?.id);
      setIsObserver(participant?.is_observer || false);
    }
  });
  
  // Start countdown when room is ready
  useEffect(() => {
    if (isStarted && !countdown) {
      // 3, 2, 1, GO countdown
      setCountdown(3);
      
      const interval = setInterval(() => {
        setCountdown(prev => {
          if (prev === null || prev <= 0) {
            clearInterval(interval);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [isStarted, countdown]);
  
  // Navigate to results when game ends
  useEffect(() => {
    if (isFinished && game?.id) {
      setTimeout(() => {
        navigate(`/game-results/${game.id}`);
      }, 1000);
    }
  }, [isFinished, game, navigate]);
  
  // Get max taps among all players
  const getMaxTaps = () => {
    return Math.max(...players.map(p => p.taps || 0), 1); // Prevent division by zero
  };
  
  // Calculate progress percentage
  const calculateProgress = (playerTaps: number) => {
    const maxTaps = getMaxTaps();
    return (playerTaps / maxTaps) * 100;
  };
  
  // Get sorted players by taps count (descending)
  const getSortedPlayers = () => {
    return [...players].sort((a, b) => (b.taps || 0) - (a.taps || 0));
  };
  
  // Handle tap
  const handleTapClick = () => {
    if (!isObserver) {
      handleTap();
    }
  };
  
  // Render countdown overlay
  const renderCountdown = () => {
    if (countdown === null) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="countdown-animation text-white text-6xl font-bold">
          {countdown === 0 ? 'GO!' : countdown}
        </div>
      </div>
    );
  };

  return (
    <>
      <Header 
        title={room ? `${t('room')}: ${room.type || t('standard')} • ${room.entry_fee} ⭐` : t('game_room')}
        showBackButton={true}
      />
      <div className="p-6 text-center">
        {isObserver && (
          <div className="mb-4 bg-telegram-gray-100 text-telegram-gray-700 py-2 px-4 rounded-full inline-block">
            <i className="fas fa-eye mr-2"></i> {t('observer_mode')}
          </div>
        )}
        
        {countdown !== null ? (
          <div className="text-4xl font-bold mb-8">
            {countdown === 0 ? 'GO!' : countdown}
          </div>
        ) : (
          <>
            <div className="mb-8">
              <ProgressBar 
                value={remainingTime} 
                max={room?.duration || 60} 
              />
              <div className="text-sm text-telegram-gray-600 mt-2">
                {formatTime(remainingTime)}
              </div>
            </div>

            <div className="relative h-64 w-64 mx-auto mb-8">
              <TapButton 
                onClick={handleTapClick}
                disabled={isObserver}
                className={isObserver ? 'opacity-50 cursor-not-allowed' : ''}
              />
              
              {/* Players positioned in a circle */}
              {players.map((player, index) => {
                const totalPlayers = players.length;
                const angle = (Math.PI * 2 * index) / totalPlayers;
                const radius = 100; // Distance from center
                const left = 50 + Math.sin(angle) * radius;
                const top = 50 + Math.cos(angle) * radius;
                
                return (
                  <div 
                    key={player.id}
                    className="absolute transform -translate-x-1/2 -translate-y-1/2"
                    style={{ 
                      left: `${left}%`, 
                      top: `${top}%` 
                    }}
                  >
                    <PlayerAvatar 
                      player={player} 
                      isCurrentUser={player.id === user?.id}
                      isReady={true}
                      taps={taps[player.id] || 0}
                    />
                  </div>
                );
              })}
            </div>

            {!isObserver && (
              <div className="text-sm text-telegram-gray-600 mb-6">
                {t('tap_to_win')}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
