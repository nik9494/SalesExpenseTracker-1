import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Header } from "@/components/layout/Header";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { formatTime, getRandomEmoji } from "@/lib/utils";
import { useGame } from "@/hooks/useGame";
import { useQuery } from "@tanstack/react-query";
import { Player } from "@shared/types";

export default function WaitingRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [, navigate] = useLocation();
  const [emojis, setEmojis] = useState<{ id: string; emoji: string; x: number; y: number; }[]>([]);
  
  const { data: userData } = useQuery({
    queryKey: ['/api/v1/users/me'],
  });
  
  const { 
    room, 
    players, 
    isStarted, 
    remainingTime, 
    handleSendReaction 
  } = useGame({ 
    roomId, 
    userId: userData?.user?.id 
  });
  
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
        title={`Room: ${room?.type || 'Standard'} • ${room?.entry_fee} ⭐`}
        showBackButton={true}
      />
      
      <div className="p-6 text-center">
        <h2 className="text-xl font-semibold mb-4">Waiting for players</h2>
        
        <div className="mb-6 font-medium text-telegram-gray-700">
          <i className="fas fa-clock mr-2"></i> Starting in <span className="text-[#0088CC]">{formatTime(remainingTime)}</span>
        </div>

        <div className="flex justify-center mb-8">
          <div className="bg-telegram-gray-100 rounded-full px-4 py-2 text-sm font-medium">
            <i className="fas fa-users mr-2 text-[#0088CC]"></i> 
            <span>{players.length}</span> / 
            <span>{room?.max_players || 4}</span> players
          </div>
        </div>

        {/* Players Circle Layout */}
        <div className="relative h-64 w-64 mx-auto mb-8">
          {/* Central tap button (invisible during waiting) */}
          <div className="w-24 h-24 rounded-full bg-telegram-gray-200 absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center text-telegram-gray-500 text-xl font-bold">
            WAIT
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

        <div className="text-sm text-telegram-gray-600 mb-6">
          Tap on player avatars to send reactions!
        </div>

        <button 
          className="bg-telegram-gray-200 text-telegram-gray-600 py-2 px-6 rounded-full text-sm font-medium" 
          disabled
        >
          Waiting for more players...
        </button>
      </div>
    </>
  );
}
