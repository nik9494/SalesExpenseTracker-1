import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useTranslation } from 'react-i18next';

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
  const { t, i18n } = useTranslation();

  const handleBackClick = () => {
    if (onBackClick) {
      onBackClick();
    } else {
      navigate("/");
    }
  };

  const handleLangChange = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('lang', lang);
  };

  return (
    <header className={cn("px-4 py-3 bg-white shadow-sm sticky top-0 z-10 flex items-center justify-between", className)}>
      {showBackButton ? (
        <button className="text-[#0088CC]" onClick={handleBackClick}>
          <i className="fas fa-arrow-left"></i>
        </button>
      ) : (
        // Название приложения всегда статичное
        <h1 className="text-xl font-bold text-[#0088CC] select-none">Chance Tap</h1>
      )}
      {showBackButton && (
        <h1 className="text-lg font-medium text-center flex-1">{title}</h1>
      )}
      {/* Красивая иконка-переключатель языка, только одна! */}
      <div className="flex items-center gap-2">
        {rightContent}
        <button
          className="ml-2 w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 bg-gray-50 hover:bg-gray-100 transition"
          onClick={() => {
            const nextLang = i18n.language === 'ru' ? 'en' : 'ru';
            handleLangChange(nextLang);
          }}
          aria-label="Switch language"
        >
          <span className="text-base">
            {i18n.language === 'ru' ? '🇬🇧' : '🇷🇺'}
          </span>
        </button>
      </div>
    </header>
  );
}
