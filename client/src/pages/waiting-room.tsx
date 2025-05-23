import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Header } from "@/components/layout/Header";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { formatTime, getRandomEmoji } from "@/lib/utils";
import { useGame } from "@/hooks/useGame";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Player } from "@shared/types";
import { useTranslation } from 'react-i18next';
import { apiRequest } from "@/lib/queryClient";
import { showError, showSuccess } from "@/lib/telegram";

export default function WaitingRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [, navigate] = useLocation();
  const { t, i18n } = useTranslation();
  const [emojis, setEmojis] = useState<{ id: string; emoji: string; x: number; y: number; }[]>([]);
  const [remainingTime, setRemainingTime] = useState<number>(0);
  const [isObserver, setIsObserver] = useState<boolean>(false);
  
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
  
  const { 
    room, 
    game,
    players, 
    taps, 
    isStarted,
    isFinished,
    handleTap
  } = useGame({ 
    roomId, 
    userId: userData?.user?.id 
  });

  // Fetch room data
  const { data: roomData, isLoading } = useQuery({
    queryKey: ['/api/v1/rooms/' + roomId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/v1/rooms/${roomId}`);
      return response.json();
    },
    onSuccess: (data) => {
      setRemainingTime(data.waitingTime || 0);
      // Проверяем, является ли пользователь наблюдателем
      const participant = data.participants?.find((p: any) => p.user_id === userData?.user?.id);
      setIsObserver(participant?.is_observer || false);
    }
  });

  const isOrganizer = room?.creator_id === userData?.user?.id;

  // Start game mutation
  const { mutate: startGame, isPending: isStarting } = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/v1/rooms/${roomId}/start`);
      return response.json();
    },
    onSuccess: () => {
      navigate(`/game-room/${roomId}`);
    },
    onError: (error) => {
      showError('Failed to start game: ' + (error as Error).message);
    }
  });

  // Delete room mutation
  const { mutate: deleteRoom, isPending: isDeleting } = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('DELETE', `/api/v1/rooms/${roomId}`);
      return response.json();
    },
    onSuccess: () => {
      showSuccess('Room deleted successfully');
      navigate('/hero-room');
    },
    onError: (error) => {
      showError('Failed to delete room: ' + (error as Error).message);
    }
  });

  // Timer countdown
  useEffect(() => {
    if (remainingTime <= 0) return;

    const timer = setInterval(() => {
      setRemainingTime(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [remainingTime]);

  // Check if game can be started
  const canStartGame = players.length >= 2;

  // Функция для отправки реакции эмодзи
  const handleSendReaction = async (playerId: string, emoji: string) => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`/api/v1/rooms/${roomId}/reactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          playerId,
          emoji
        })
      });
      
      // Показываем анимацию эмодзи локально
      createEmojiAnimation(50, 50);
    } catch (error) {
      console.error('Failed to send reaction:', error);
    }
  };
  
  // Handle player avatar click (send reaction)
  const handlePlayerClick = (player: Player) => {
    if (player.id === userData?.user?.id) {
      // For own avatar, show emoji from self
      createEmojiAnimation(50, 50);
    } else {
      // For other avatars, send reaction
      handleSendReaction(player.id, getRandomEmoji());
    }
  };
  
  // Create emoji animation
  const createEmojiAnimation = (x: number, y: number) => {
    const id = Date.now().toString();
    const emoji = getRandomEmoji();
    
    setEmojis(prev => [...prev, { id, emoji, x, y }]);
    
    // Remove emoji after animation completes
    setTimeout(() => {
      setEmojis(prev => prev.filter(e => e.id !== id));
    }, 1500);
  };
  
  // Navigate to game room when the game starts
  useEffect(() => {
    if (isStarted && roomId) {
      navigate(`/game-room/${roomId}`);
    }
  }, [isStarted, roomId, navigate]);
  
  // Create placeholder players array to fill empty slots
  const getPlayersWithEmptySlots = () => {
    const currentPlayers = [...players];
    const maxPlayers = room?.max_players || 4;
    
    // Fill empty slots
    while (currentPlayers.length < maxPlayers) {
      currentPlayers.push(null as any);
    }
    
    return currentPlayers;
  };
  
  return (
    <>
      <Header 
        title={room ? `${t('room')}: ${room.type || t('standard')} • ${room.entry_fee} ⭐` : t('waiting_room')}
        showBackButton={true}
      />
      <div className="p-6 text-center">
        <h2 className="text-xl font-semibold mb-4">
          {isObserver ? t('observer_mode') : t('waiting_for_players')}
        </h2>
        {!isObserver && (
          <div className="mb-6 font-medium text-telegram-gray-700">
            <i className="fas fa-clock mr-2"></i> {t('starting_in')} <span className="text-[#0088CC]">{formatTime(remainingTime)}</span>
          </div>
        )}
        <div className="flex justify-center mb-8">
          <div className="bg-telegram-gray-100 rounded-full px-4 py-2 text-sm font-medium">
            <i className="fas fa-users mr-2 text-[#0088CC]"></i> 
            <span>{players.length}</span> / 
            <span>{room?.max_players || 4}</span> {t('players')}
          </div>
        </div>

        {/* Players Circle Layout */}
        <div className="relative h-64 w-64 mx-auto mb-8">
          {/* Central tap button (invisible during waiting) */}
          <div className="w-24 h-24 rounded-full bg-telegram-gray-200 absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center text-telegram-gray-500 text-xl font-bold">
            {isObserver ? 'OBS' : 'WAIT'}
          </div>

          {/* Players positioned in a circle */}
          {getPlayersWithEmptySlots().map((player, index) => {
            const totalPlayers = room?.max_players || 4;
            const angle = (Math.PI * 2 * index) / totalPlayers;
            const radius = 100; // Distance from center
            const left = 50 + Math.sin(angle) * radius;
            const top = 50 + Math.cos(angle) * radius;
            
            return (
              <div 
                key={player?.id || `empty-${index}`}
                className="absolute transform -translate-x-1/2 -translate-y-1/2"
                style={{ 
                  left: `${left}%`, 
                  top: `${top}%` 
                }}
              >
                <PlayerAvatar 
                  player={player} 
                  isCurrentUser={player?.id === userData?.user?.id}
                  isReady={true}
                  onClick={handlePlayerClick}
                />
              </div>
            );
          })}
          
          {/* Emoji reactions */}
          {emojis.map(({ id, emoji, x, y }) => (
            <div 
              key={id}
              className="emoji-reaction absolute text-2xl"
              style={{ 
                left: `${x}%`, 
                top: `${y}%`,
                animation: 'float-up 1.5s ease-out forwards'
              }}
            >
              {emoji}
            </div>
          ))}
        </div>

        {!isObserver && (
          <div className="text-sm text-telegram-gray-600 mb-6">
            {t('tap_on_avatars')}
          </div>
        )}

        {!isObserver && (
          <button 
            className="bg-telegram-gray-200 text-telegram-gray-600 py-2 px-6 rounded-full text-sm font-medium" 
            disabled
          >
            {t('waiting_for_more_players')}
          </button>
        )}

        {/* Room Code and Timer */}
        <div className="bg-white rounded-xl shadow-md p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm text-telegram-gray-600">{t('room_code')}</div>
              <div className="text-2xl font-bold tracking-wider">{room?.code}</div>
            </div>
            {!isObserver && (
              <div className="text-right">
                <div className="text-sm text-telegram-gray-600">{t('time_remaining')}</div>
                <div className="text-2xl font-bold text-amber-600">
                  {formatTime(remainingTime)}
                </div>
              </div>
            )}
          </div>
          
          {isOrganizer && !isObserver && (
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button
                className={`py-2.5 px-6 rounded-full text-sm font-medium ${
                  canStartGame 
                    ? 'bg-amber-500 text-white' 
                    : 'bg-telegram-gray-200 text-telegram-gray-500'
                }`}
                onClick={() => startGame()}
                disabled={!canStartGame || isStarting}
              >
                {isStarting ? t('starting') + '...' : t('start_game')}
              </button>
              <button
                className="bg-red-500 text-white py-2.5 px-6 rounded-full text-sm font-medium"
                onClick={() => deleteRoom()}
                disabled={isDeleting}
              >
                {isDeleting ? t('deleting') + '...' : t('delete_room')}
              </button>
            </div>
          )}
        </div>

        {/* Players List */}
        <div className="bg-white rounded-xl shadow-md p-5">
          <h3 className="font-medium mb-4">{t('players')} ({players.length}/30)</h3>
          
          <div className="space-y-3">
            {players.map((player) => (
              <div key={player.id} className="flex items-center">
                <div className="w-10 h-10 rounded-full overflow-hidden mr-3">
                  <img 
                    src={player.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(player.username)}&background=random`}
                    alt={player.username}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <div className="font-medium">{player.username}</div>
                  <div className="text-xs text-telegram-gray-500">
                    {player.id === room?.creator_id ? t('organizer') : 
                     player.is_observer ? t('observer') : t('player')}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Waiting Message */}
          {!isObserver && players.length < 2 && (
            <div className="mt-4 text-center text-sm text-telegram-gray-500">
              {t('waiting_for_players', { count: 2 - players.length })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
