import { cn } from "@/lib/utils";
import { Player } from "@shared/types";

interface PlayerAvatarProps {
  player: Player | null;
  isCurrentUser?: boolean;
  isReady?: boolean;
  size?: "small" | "medium" | "large";
  onClick?: (player: Player) => void;
  className?: string;
}

export function PlayerAvatar({ 
  player, 
  isCurrentUser = false, 
  isReady = false, 
  size = "medium", 
  onClick, 
  className 
}: PlayerAvatarProps) {
  // Size mapping
  const sizeClasses = {
    small: "w-8 h-8",
    medium: "w-14 h-14",
    large: "w-20 h-20"
  };

  // Border sizes
  const borderClasses = {
    small: "border-2",
    medium: "border-2",
    large: "border-4"
  };

  // Handle player click
  const handleClick = () => {
    if (player && onClick) {
      onClick(player);
    }
  };

  // If no player, render empty slot
  if (!player) {
    return (
      <div className="flex flex-col items-center">
        <div 
          className={cn(
            "rounded-full border-dashed border-telegram-gray-300 bg-telegram-gray-100 flex items-center justify-center",
            sizeClasses[size],
            borderClasses[size],
            className
          )}
        >
          <i className="fas fa-user-plus text-telegram-gray-400"></i>
        </div>
        <span className="text-xs font-medium mt-1 text-telegram-gray-500">Waiting...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div 
        className={cn(
          "rounded-full relative overflow-hidden cursor-pointer",
          sizeClasses[size],
          isCurrentUser ? "border-[#0088CC]" : "border-telegram-gray-300",
          borderClasses[size],
          className
        )}
        onClick={handleClick}
      >
        <img
          src={player.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(player.username)}&background=random`}
          alt={player.username}
          className="w-full h-full rounded-full object-cover"
        />
        {isReady && (
          <div className="absolute -bottom-1 -right-1 bg-[#0088CC] text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
            <i className="fas fa-check text-xs"></i>
          </div>
        )}
      </div>
      <span className="text-xs font-medium mt-1">
        {isCurrentUser ? "You" : player.username}
      </span>
    </div>
  );
}
