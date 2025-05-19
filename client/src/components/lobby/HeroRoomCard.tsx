import { useLocation } from "wouter";

interface HeroRoomCardProps {
  onClick?: () => void;
}

export function HeroRoomCard({ onClick }: HeroRoomCardProps) {
  const [, navigate] = useLocation();

  const handleEnterHero = () => {
    if (onClick) {
      onClick();
    } else {
      navigate("/hero-room");
    }
  };

  return (
    <div className="bg-gradient-to-br from-yellow-50 to-amber-100 rounded-xl shadow-md p-3 border border-yellow-400 relative hero-pulse">
      <div className="absolute top-2 right-2 bg-yellow-400 text-white text-xs px-2 py-1 rounded-full">
        <i className="fas fa-crown mr-1"></i> Hero
      </div>
      <div className="text-center mt-3">
        <div className="text-telegram-gray-700 text-sm mb-1">Custom Games</div>
        <div className="text-lg font-bold flex items-center justify-center text-amber-600">
          Create or Join
        </div>
      </div>
      <div className="mt-3 text-center">
        <button 
          className="bg-amber-500 text-white text-sm py-1.5 px-4 rounded-full font-medium"
          onClick={handleEnterHero}
        >
          Enter Hero
        </button>
      </div>
    </div>
  );
}
