import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Header } from "@/components/layout/Header";
import { TapButton } from "@/components/game/TapButton";
import { ProgressBar } from "@/components/game/ProgressBar";
import { formatTime } from "@/lib/utils";
import { useGame } from "@/hooks/useGame";
import { useQuery } from "@tanstack/react-query";
import { Player } from "@shared/types";

export default function GameRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [, navigate] = useLocation();
  const [countdown, setCountdown] = useState<number | null>(null);
  
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
        title=""
        rightContent={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center">
              <div className="bg-[#0088CC] text-white inline-block px-2 py-0.5 rounded-full text-xs font-medium mr-2">
                {room?.type || 'Standard'}
              </div>
              <div className="text-sm font-medium flex items-center">
                <i className="fas fa-star text-yellow-400 mr-1"></i> {room?.entry_fee || 0}
              </div>
            </div>
            <div className="text-center font-bold text-lg">
              <i className="far fa-clock mr-1 text-[#0088CC]"></i>
              <span className="text-[#0088CC]">{formatTime(remainingTime)}</span>
            </div>
            <div className="flex items-center">
              <div className="bg-telegram-gray-200 text-xs px-2 py-0.5 rounded-full text-telegram-gray-700">
                <i className="fas fa-users mr-1"></i> {players.length}/{room?.max_players || 4}
              </div>
            </div>
          </div>
        }
      />
      
      <div className="p-0 relative h-[calc(100vh-128px)]">
        {/* Круговое размещение игроков вокруг кнопки */}
        <div className="absolute inset-0 w-full h-full flex items-center justify-center">
          {/* Player Avatars Around Button - circular positioning */}
          <div className="relative w-[280px] h-[280px]">
            {/* Круглая кнопка в центре */}
            <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
              <TapButton 
                onTap={handleTap}
                disabled={!isStarted || isFinished || countdown !== null}
                tapCount={taps}
              />
              <div className="text-center mt-4 text-4xl font-bold">{taps}</div>
            </div>
            
            {/* Аватары игроков по кругу */}
            {players.map((player, index) => {
              const isCurrentUser = player.id === user?.id;
              const playerTaps = isCurrentUser ? taps : (player.taps || 0);
              const totalPlayers = players.length;
              
              // Рассчитываем позицию игрока по кругу
              const angle = (index / totalPlayers) * 2 * Math.PI;
              const radius = 120; // Радиус круга, по которому размещаются игроки
              const left = 140 + radius * Math.cos(angle - Math.PI/2);
              const top = 140 + radius * Math.sin(angle - Math.PI/2);
              
              return (
                <div 
                  key={player.id}
                  className="absolute transform -translate-x-1/2 -translate-y-1/2"
                  style={{
                    left: `${left}px`,
                    top: `${top}px`,
                    transition: 'all 0.5s ease',
                    zIndex: isCurrentUser ? 5 : 1
                  }}
                >
                  {/* Аватар игрока */}
                  <div className={`relative ${isCurrentUser ? 'scale-110' : ''}`}>
                    <div className={`w-14 h-14 rounded-full overflow-hidden border-2 ${isCurrentUser ? 'border-[#0088CC]' : 'border-telegram-gray-300'}`}>
                      <img 
                        src={player.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(player.username)}&background=random`}
                        alt={isCurrentUser ? 'You' : player.username} 
                        className="w-full h-full object-cover" 
                      />
                    </div>
                    
                    {/* Имя игрока */}
                    <div className="mt-1 text-xs font-medium text-center whitespace-nowrap overflow-hidden text-ellipsis max-w-[70px] mx-auto">
                      {isCurrentUser ? 'You' : player.username}
                    </div>
                    
                    {/* Количество тапов */}
                    <div className="mt-0.5 text-xs font-bold text-center text-[#0088CC]">
                      {playerTaps} taps
                    </div>
                    
                    {/* Индикатор прогресса (круговой) */}
                    <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                      <svg className="w-full h-full" viewBox="0 0 56 56">
                        <circle 
                          cx="28" 
                          cy="28" 
                          r="26" 
                          fill="none" 
                          stroke="#eee" 
                          strokeWidth="4"
                        />
                        <circle 
                          cx="28" 
                          cy="28" 
                          r="26" 
                          fill="none" 
                          stroke={isCurrentUser ? "#0088CC" : "#888"} 
                          strokeWidth="4"
                          strokeDasharray={`${calculateProgress(playerTaps) * 1.63} 170`}
                          transform="rotate(-90, 28, 28)"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Отображение полных прогресс-баров игроков вверху экрана */}
        <div className="absolute top-6 left-0 right-0 px-4 space-y-3">
          {getSortedPlayers().map((player) => {
            const isCurrentUser = player.id === user?.id;
            const playerTaps = isCurrentUser ? taps : (player.taps || 0);
            
            return (
              <div className="flex items-center" key={`bar-${player.id}`}>
                <div className={`w-8 h-8 rounded-full overflow-hidden mr-2 border-2 ${isCurrentUser ? 'border-[#0088CC]' : 'border-telegram-gray-300'}`}>
                  <img 
                    src={player.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(player.username)}&background=random`}
                    alt={isCurrentUser ? 'You' : player.username} 
                    className="w-full h-full object-cover" 
                  />
                </div>
                <ProgressBar
                  value={playerTaps}
                  max={getMaxTaps()}
                  label={isCurrentUser ? 'You' : player.username}
                  labelValue={playerTaps}
                  color={isCurrentUser ? 'primary' : 'gray'}
                  className="flex-1"
                />
              </div>
            );
          })}
        </div>
        
        {/* Countdown overlay */}
        {renderCountdown()}
      </div>
    </>
  );
}
