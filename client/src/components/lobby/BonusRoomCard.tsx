import { useLocation } from "wouter";

interface BonusRoomCardProps {
  bonusAmount: number;
  onClick?: () => void;
}

export function BonusRoomCard({ bonusAmount, onClick }: BonusRoomCardProps) {
  const [, navigate] = useLocation();

  const handleStartBonus = () => {
    if (onClick) {
      onClick();
    } else {
      navigate("/bonus-room");
    }
  };

  return (
    <div className="bg-[#E7F5FF] rounded-xl shadow-md p-3 border border-[#0088CC] relative">
      <div className="absolute top-2 right-2 bg-[#0088CC] text-white text-xs px-2 py-1 rounded-full">
        <i className="fas fa-gift mr-1"></i> Bonus
      </div>
      <div className="text-center mt-3">
        <div className="text-telegram-gray-700 text-sm mb-1">Reward</div>
        <div className="text-xl font-bold flex items-center justify-center text-[#0088CC]">
          <i className="fas fa-star text-yellow-400 mr-1"></i> {bonusAmount}
        </div>
      </div>
      <div className="mt-3 text-center">
        <button 
          className="bg-[#0088CC] text-white text-sm py-1.5 px-4 rounded-full font-medium"
          onClick={handleStartBonus}
        >
          Start Bonus
        </button>
      </div>
    </div>
  );
}
