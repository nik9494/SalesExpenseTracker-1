/**
 * Telegram WebApp API wrapper
 */

// Type declarations for Telegram WebApp
declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    query_id?: string;
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
      photo_url?: string;
    };
    auth_date: number;
    hash: string;
  };
  colorScheme: 'light' | 'dark';
  themeParams: {
    bg_color: string;
    text_color: string;
    hint_color: string;
    link_color: string;
    button_color: string;
    button_text_color: string;
    secondary_bg_color: string;
  };
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  headerColor: string;
  backgroundColor: string;
  ready(): void;
  expand(): void;
  close(): void;
  showPopup(params: any, callback?: Function): void;
  showAlert(message: string, callback?: Function): void;
  showConfirm(message: string, callback?: Function): void;
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    setText(text: string): void;
    onClick(callback: Function): void;
    offClick(callback: Function): void;
    show(): void;
    hide(): void;
    enable(): void;
    disable(): void;
  };
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
  openInvoice(url: string, callback?: Function): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
}

/**
 * Get Telegram Web App instance
 */
export const getTelegramWebApp = (): TelegramWebApp | null => {
  if (window.Telegram?.WebApp) {
    return window.Telegram.WebApp;
  }
  return null;
};

/**
 * Validate if the user is opening the app from Telegram
 * 
 * В режиме разработки будем возвращать true для удобства работы
 */
export const isTelegramWebAppValid = (): boolean => {
  // В режиме разработки считаем, что все валидно
  if (import.meta.env.DEV) {
    return true;
  }
  
  const webApp = getTelegramWebApp();
  return Boolean(webApp && webApp.initData && webApp.initData.length > 0);
};

/**
 * Get the Telegram user information
 */
export const getTelegramUser = () => {
  const webApp = getTelegramWebApp();
  return webApp?.initDataUnsafe?.user;
};

/**
 * Show success notification with haptic feedback
 */
export const showSuccess = (message: string): void => {
  const webApp = getTelegramWebApp();
  if (webApp) {
    webApp.HapticFeedback.notificationOccurred('success');
    webApp.showPopup({
      title: "Success",
      message,
      buttons: [{ type: "ok" }]
    });
  }
};

/**
 * Show error notification with haptic feedback
 */
export const showError = (message: string): void => {
  const webApp = getTelegramWebApp();
  if (webApp) {
    webApp.HapticFeedback.notificationOccurred('error');
    webApp.showPopup({
      title: "Error",
      message,
      buttons: [{ type: "ok" }]
    });
  }
};

/**
 * Trigger haptic feedback for tap
 */
export const triggerTapFeedback = (): void => {
  const webApp = getTelegramWebApp();
  if (webApp) {
    webApp.HapticFeedback.impactOccurred('light');
  }
};

/**
 * Share content via Telegram
 */
export const shareViaBot = (text: string): void => {
  const webApp = getTelegramWebApp();
  if (webApp) {
    webApp.showPopup({
      title: "Share",
      message: "Do you want to share this with your friends?",
      buttons: [
        { type: "cancel" },
        { 
          type: "default", 
          text: "Share", 
          id: "share"
        }
      ]
    }, (buttonId: string) => {
      if (buttonId === "share") {
        // This would require a bot implementation to handle the callback
        webApp.close();
      }
    });
  }
};
