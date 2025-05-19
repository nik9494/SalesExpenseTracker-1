import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

interface HeaderProps {
  title: string;
  showBackButton?: boolean;
  onBackClick?: () => void;
  rightContent?: React.ReactNode;
  className?: string;
}

export function Header({
  title,
  showBackButton = false,
  onBackClick,
  rightContent,
  className,
}: HeaderProps) {
  const [, navigate] = useLocation();

  const handleBackClick = () => {
    if (onBackClick) {
      onBackClick();
    } else {
      navigate("/");
    }
  };

  return (
    <header className={cn("px-4 py-3 bg-white shadow-sm sticky top-0 z-10 flex items-center justify-between", className)}>
      {showBackButton ? (
        <button className="text-[#0088CC]" onClick={handleBackClick}>
          <i className="fas fa-arrow-left"></i>
        </button>
      ) : (
        <h1 className="text-xl font-bold text-[#0088CC]">{title}</h1>
      )}
      
      {showBackButton && (
        <h1 className="text-lg font-medium text-center flex-1">{title}</h1>
      )}
      
      {rightContent ? (
        rightContent
      ) : (
        showBackButton ? <div className="w-6"></div> : null
      )}
    </header>
  );
}
