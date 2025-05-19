import { useCallback, useEffect, useState } from 'react';
import { 
  getTelegramWebApp, 
  getTelegramUser, 
  isTelegramWebAppValid,
  showSuccess,
  showError,
  triggerTapFeedback
} from '@/lib/telegram';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

export const useTelegram = () => {
  const [telegramUser, setTelegramUser] = useState<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const { toast } = useToast();

  const initTelegram = useCallback(async () => {
    const webApp = getTelegramWebApp();
    
    if (!webApp) {
      console.warn('Telegram WebApp not available');
      setIsInitialized(false);
      return;
    }
    
    try {
      // Mark app as ready
      webApp.ready();
      
      // Get user data
      const user = getTelegramUser();
      setTelegramUser(user);
      
      // Check if user is valid
      if (!isTelegramWebAppValid()) {
        console.warn('Telegram WebApp validation failed');
        setIsInitialized(false);
        return;
      }
      
      // Login user to backend
      if (user) {
        try {
          const response = await apiRequest('POST', '/api/v1/auth/telegram', {
            telegramData: webApp.initData
          });
          
          if (!response.ok) {
            throw new Error('Authentication failed');
          }
          
          setIsInitialized(true);
        } catch (error) {
          console.error('Error authenticating user:', error);
          toast({
            title: 'Authentication Error',
            description: 'Failed to authenticate with Telegram',
            variant: 'destructive',
          });
        }
      }
    } catch (error) {
      console.error('Error initializing Telegram WebApp:', error);
      setIsInitialized(false);
    }
  }, [toast]);

  // Set up main button
  const setMainButton = useCallback((text: string, callback: () => void) => {
    const webApp = getTelegramWebApp();
    if (!webApp) return;
    
    webApp.MainButton.text = text;
    webApp.MainButton.color = webApp.themeParams?.button_color || '#0088CC';
    webApp.MainButton.textColor = webApp.themeParams?.button_text_color || '#FFFFFF';
    
    webApp.MainButton.onClick(callback);
    webApp.MainButton.show();
    
    return () => {
      webApp.MainButton.offClick(callback);
      webApp.MainButton.hide();
    };
  }, []);

  // Haptic feedback
  const triggerHapticFeedback = useCallback((style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => {
    const webApp = getTelegramWebApp();
    if (!webApp) return;
    
    webApp.HapticFeedback.impactOccurred(style);
  }, []);

  // Close app
  const closeApp = useCallback(() => {
    const webApp = getTelegramWebApp();
    if (!webApp) return;
    
    webApp.close();
  }, []);

  // Show popup
  const showPopup = useCallback((title: string, message: string, buttons: any[] = [{ type: 'ok' }], callback?: (buttonId: string) => void) => {
    const webApp = getTelegramWebApp();
    if (!webApp) return;
    
    webApp.showPopup({
      title,
      message,
      buttons
    }, callback);
  }, []);

  useEffect(() => {
    if (!isInitialized) {
      initTelegram();
    }
  }, [isInitialized, initTelegram]);

  return {
    telegramUser,
    isInitialized,
    initTelegram,
    setMainButton,
    triggerHapticFeedback,
    closeApp,
    showPopup,
    showSuccess,
    showError,
    triggerTapFeedback
  };
};
