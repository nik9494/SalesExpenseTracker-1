import { useState } from "react";
import { useLocation } from "wouter";
import { Header } from "@/components/layout/Header";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { showError, showSuccess } from "@/lib/telegram";

export default function CreateHeroRoomPage() {
  const [, navigate] = useLocation();
  const [entryFee, setEntryFee] = useState(100);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [gameDuration, setGameDuration] = useState(60);
  const [waitingTime, setWaitingTime] = useState(300);
  
  // Create a new hero room
  const { mutate: createRoom, isPending } = useMutation({
    mutationFn: async (roomData: any) => {
      const response = await apiRequest('POST', '/api/v1/rooms/hero', roomData);
      return response.json();
    },
    onSuccess: (data) => {
      showSuccess(`Hero room created! Code: ${data.room.code}`);
      navigate(`/waiting-room/${data.room.id}`);
    },
    onError: (error) => {
      showError('Failed to create room: ' + (error as Error).message);
    }
  });
  
  // Handle form submission
  const handleCreateRoom = () => {
    if (entryFee < 10 || entryFee > 1000) {
      showError('Entry fee must be between 10 and 1000 Stars');
      return;
    }
    
    createRoom({
      entry_fee: entryFee,
      max_players: maxPlayers,
      game_duration: gameDuration,
      waiting_time: waitingTime
    });
  };
  
  return (
    <>
      <Header 
        title="Create Hero Room"
        showBackButton={true}
      />
      
      <div className="p-6">
        <form onSubmit={(e) => {
          e.preventDefault();
          handleCreateRoom();
        }}>
          <div className="mb-5">
            <label className="block text-sm font-medium text-telegram-gray-700 mb-1">Entry Fee (Stars)</label>
            <div className="relative">
              <input 
                type="number" 
                value={entryFee} 
                min={10} 
                max={1000} 
                className="w-full px-4 py-2 border border-telegram-gray-300 rounded-lg text-lg font-medium pl-9" 
                onChange={(e) => setEntryFee(parseInt(e.target.value) || 10)}
              />
              <i className="fas fa-star text-yellow-400 absolute left-3 top-1/2 transform -translate-y-1/2"></i>
            </div>
            <div className="text-xs text-telegram-gray-500 mt-1">
              Min: 10 Stars, Max: 1000 Stars
            </div>
          </div>
          
          <div className="mb-5">
            <label className="block text-sm font-medium text-telegram-gray-700 mb-1">Maximum Players</label>
            <select 
              className="w-full px-4 py-2 border border-telegram-gray-300 rounded-lg"
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(parseInt(e.target.value))}
            >
              <option value={2}>2 players</option>
              <option value={4}>4 players</option>
              <option value={8}>8 players</option>
              <option value={12}>12 players</option>
              <option value={20}>20 players</option>
              <option value={30}>30 players (max)</option>
            </select>
          </div>
          
          <div className="mb-5">
            <label className="block text-sm font-medium text-telegram-gray-700 mb-1">Game Duration</label>
            <select 
              className="w-full px-4 py-2 border border-telegram-gray-300 rounded-lg"
              value={gameDuration}
              onChange={(e) => setGameDuration(parseInt(e.target.value))}
            >
              <option value={30}>30 seconds</option>
              <option value={60}>60 seconds</option>
              <option value={90}>90 seconds</option>
              <option value={120}>2 minutes</option>
              <option value={180}>3 minutes</option>
            </select>
          </div>
          
          <div className="mb-7">
            <label className="block text-sm font-medium text-telegram-gray-700 mb-1">Waiting Time</label>
            <select 
              className="w-full px-4 py-2 border border-telegram-gray-300 rounded-lg"
              value={waitingTime}
              onChange={(e) => setWaitingTime(parseInt(e.target.value))}
            >
              <option value={60}>1 minute</option>
              <option value={120}>2 minutes</option>
              <option value={300}>5 minutes</option>
              <option value={600}>10 minutes</option>
            </select>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <button 
              type="button" 
              className="bg-telegram-gray-200 text-telegram-gray-800 py-2.5 px-6 rounded-full text-sm font-medium"
              onClick={() => navigate("/hero-room")}
              disabled={isPending}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="bg-amber-500 text-white py-2.5 px-6 rounded-full text-sm font-medium"
              disabled={isPending}
            >
              {isPending ? 'Creating...' : 'Create Room'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
