import { useCallback, useEffect, useState, useRef } from 'react';
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
import { queryClient } from '@/lib/queryClient';

export const useTelegram = () => {
  const [telegramUser, setTelegramUser] = useState<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const isPopupOpenRef = useRef(false);
  const isInitInProgress = useRef(false); // Новый флаг
  const hasShownWelcomePopup = useRef(false); // Флаг для показа welcome popup
  const { toast } = useToast();

  const initTelegram = useCallback(async () => {
    if (isInitInProgress.current) {
      console.log('Initialization already in progress...');
      return;
    }

    isInitInProgress.current = true;
    console.log('Initializing Telegram WebApp...');

    // Add delay to ensure Telegram WebApp is loaded
    await new Promise(resolve => setTimeout(resolve, 1000));

    const webApp = getTelegramWebApp();
    console.log('Telegram WebApp instance:', webApp);

    if (!webApp) {
      console.warn('Telegram WebApp not available');
      setIsInitialized(false);
      isInitInProgress.current = false;
      return;
    }

    try {
      // Mark app as ready
      console.log('Calling webApp.ready()...');
      webApp.ready();
      console.log('WebApp ready called successfully');

      // Get user data
      const user = getTelegramUser();
      console.log('Telegram user data:', user);
      setTelegramUser(user);

      // Check if user is valid
      const isValid = isTelegramWebAppValid();
      console.log('Is Telegram WebApp valid:', isValid);

      if (!isValid) {
        console.warn('Telegram WebApp validation failed');
        setIsInitialized(false);
        isInitInProgress.current = false;
        return;
      }

      // Login user to backend
      if (user) {
        try {
          console.log('Attempting to authenticate with backend...');

          if (!webApp.initData) {
            throw new Error('Приложение должно быть открыто из Telegram. Данные Telegram не получены.');
          }
          const response = await apiRequest('POST', '/api/v1/auth/telegram', {
            telegramData: webApp.initData
          });
          const data = await response.json();
          if (data.token) {
            localStorage.setItem('token', data.token);
            await queryClient.invalidateQueries({ queryKey: ['/api/v1/users/me'] });
          }

          console.log('Backend authentication response:', response);

          if (!response.ok) {
            throw new Error('Authentication failed');
          }

          console.log('Authentication successful, setting isInitialized to true');

          // После успешной авторизации сбрасываем кэш пользователя
          await queryClient.invalidateQueries({ queryKey: ['/api/v1/users/me'] });

          // Show welcome message только если не показывали в этой сессии
          if (!hasShownWelcomePopup.current) {
            hasShownWelcomePopup.current = true;
            setIsPopupOpen(true);
            isPopupOpenRef.current = true;
            webApp.showPopup({
              title: 'Добро пожаловать в TapGame!',
              message: 'Нажимайте на кнопку быстрее всех и выигрывайте призы!',
              buttons: [{ type: 'ok' }]
            }, () => {
              setIsPopupOpen(false);
              isPopupOpenRef.current = false;
            });
          }

          // Set up main button
          webApp.MainButton.text = 'Начать игру';
          webApp.MainButton.show();
          webApp.MainButton.onClick(() => {
            window.location.href = '/';
          });
          setIsInitialized(true);
        } catch (error) {
          console.error('Error authenticating user:', error);
          toast({
            title: 'Authentication Error',
            description: 'Failed to authenticate with Telegram',
            variant: 'destructive',
          });
        }
      } else {
        console.warn('No user data available for authentication');
      }
    } catch (error) {
      console.error('Error initializing Telegram WebApp:', error);
      setIsInitialized(false);
    } finally {
      isInitInProgress.current = false; // Сбросить флаг после завершения
    }
  }, [toast, isPopupOpen]);

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
    if (isPopupOpenRef.current) return;
    setIsPopupOpen(true);
    isPopupOpenRef.current = true;
    webApp.showPopup({
      title,
      message,
      buttons
    }, (buttonId: string) => {
      setIsPopupOpen(false);
      isPopupOpenRef.current = false;
      if (callback) callback(buttonId);
    });
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