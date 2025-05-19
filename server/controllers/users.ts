import { Express, Request, Response } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { validateTelegramAuth, requireAuth } from "../utils/telegramAuth";
import { generateReferralCode } from "../utils/helpers";

// User creation schema
const userSchema = z.object({
  telegram_id: z.number(),
  username: z.string(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  photo_url: z.string().optional()
});

// Wallet connection schema
const walletSchema = z.object({
  ton_address: z.string()
});

// Add stars schema (simulated payment)
const addStarsSchema = z.object({
  amount: z.number().min(10).max(10000)
});

// Referral code application schema
const applyReferralSchema = z.object({
  code: z.string().min(4).max(10)
});

export function registerUserRoutes(app: Express, prefix: string) {
  // Telegram authentication
  app.post(`${prefix}/auth/telegram`, async (req: Request, res: Response) => {
    try {
      const { telegramData } = req.body;
      
      // Validate Telegram auth data
      const userData = validateTelegramAuth(telegramData);
      if (!userData) {
        return res.status(401).json({ message: "Invalid Telegram authentication" });
      }
      
      const { id: telegram_id, username, first_name, last_name, photo_url } = userData;
      
      // Check if user exists
      let user = await storage.getUserByTelegramId(telegram_id);
      
      // Create user if not exists
      if (!user) {
        // Generate unique referral code
        const referralCode = generateReferralCode(username || first_name || "user");
        
        user = await storage.createUser({
          id: uuidv4(),
          telegram_id,
          username: username || `${first_name || "User"}${telegram_id.toString().substr(-4)}`,
          balance_stars: 100, // Starting balance
          has_ton_wallet: false,
          photo_url: photo_url || null,
          created_at: new Date(),
          referral_code: referralCode
        });
        
        // Create referral entry
        await storage.createReferral({
          code: referralCode,
          user_id: user.id,
          bonus_amount: 10, // 10% of first game
          created_at: new Date()
        });
      }
      
      // Create a session (in a real app, you'd generate a JWT here)
      req.session.userId = user.id;
      
      res.json({ 
        success: true, 
        user: {
          id: user.id,
          username: user.username,
          balance_stars: user.balance_stars,
          has_ton_wallet: user.has_ton_wallet,
          photo_url: user.photo_url
        } 
      });
    } catch (error) {
      console.error("Authentication error:", error);
      res.status(500).json({ message: "Authentication failed" });
    }
  });
  
  // Get current user
  app.get(`${prefix}/users/me`, requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Get wallet if exists
      const wallet = await storage.getWallet(userId);
      
      // Get bonus progress if exists
      const bonusProgress = await storage.getBonusProgress(userId);
      
      // Get referrals count and amount earned
      // This would be a more complex query in a real app
      const referrals = 0; // Placeholder
      
      res.json({
        user: {
          id: user.id,
          telegram_id: user.telegram_id,
          username: user.username,
          balance_stars: user.balance_stars,
          has_ton_wallet: user.has_ton_wallet,
          photo_url: user.photo_url,
          created_at: user.created_at,
          referral_code: user.referral_code,
          wallet_address: wallet?.ton_address,
          bonus_progress: bonusProgress ? {
            taps_so_far: bonusProgress.taps_so_far,
            start_time: bonusProgress.start_time,
            end_time: bonusProgress.end_time,
            completed: bonusProgress.completed
          } : null,
          total_games: 0, // Placeholder
          total_wins: 0, // Placeholder
          total_taps: 0, // Placeholder
          total_won: 0, // Placeholder
          referrals_count: referrals,
          referrals_earned: 0 // Placeholder
        }
      });
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user data" });
    }
  });
  
  // Connect TON wallet
  app.post(`${prefix}/wallet/connect`, requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const validation = walletSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid wallet data", errors: validation.error.errors });
      }
      
      const { ton_address } = validation.data;
      
      // Check if wallet already exists
      const existingWallet = await storage.getWallet(userId);
      if (existingWallet) {
        return res.status(400).json({ message: "Wallet already connected" });
      }
      
      // Create wallet
      const wallet = await storage.createWallet({
        id: uuidv4(),
        user_id: userId,
        ton_address,
        created_at: new Date()
      });
      
      // Update user has_ton_wallet flag
      await storage.updateUser(userId, { has_ton_wallet: true });
      
      res.json({ success: true, wallet });
    } catch (error) {
      console.error("Error connecting wallet:", error);
      res.status(500).json({ message: "Failed to connect wallet" });
    }
  });
  
  // Get wallet status
  app.get(`${prefix}/wallet/status`, requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const wallet = await storage.getWallet(userId);
      
      res.json({
        connected: !!wallet,
        wallet: wallet ? {
          address: wallet.ton_address,
          created_at: wallet.created_at
        } : null
      });
    } catch (error) {
      console.error("Error getting wallet status:", error);
      res.status(500).json({ message: "Failed to get wallet status" });
    }
  });
  
  // Get wallet info
  app.get(`${prefix}/wallet/info`, requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const wallet = await storage.getWallet(userId);
      
      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }
      
      res.json({
        wallet: {
          address: wallet.ton_address,
          created_at: wallet.created_at
        }
      });
    } catch (error) {
      console.error("Error getting wallet info:", error);
      res.status(500).json({ message: "Failed to get wallet info" });
    }
  });
  
  // Disconnect wallet
  app.post(`${prefix}/wallet/disconnect`, requireAuth, async (req: Request, res: Response) => {
    try {
      // This is a stub - in a real app, you'd need to handle wallet disconnection
      // For now, we'll just return success
      res.json({ success: true });
    } catch (error) {
      console.error("Error disconnecting wallet:", error);
      res.status(500).json({ message: "Failed to disconnect wallet" });
    }
  });
  
  // Add stars (simulated payment)
  app.post(`${prefix}/users/addStars`, requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const validation = addStarsSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid amount", errors: validation.error.errors });
      }
      
      const { amount } = validation.data;
      
      // Get user
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Update user balance
      await storage.updateUser(userId, {
        balance_stars: user.balance_stars + amount
      });
      
      // Record transaction
      await storage.createTransaction({
        id: uuidv4(),
        user_id: userId,
        amount,
        type: "payment",
        description: `Added ${amount} Stars`,
        created_at: new Date()
      });
      
      res.json({ success: true, new_balance: user.balance_stars + amount });
    } catch (error) {
      console.error("Error adding stars:", error);
      res.status(500).json({ message: "Failed to add stars" });
    }
  });
  
  // Apply referral code
  app.post(`${prefix}/users/applyReferral`, requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.id;
      const validation = applyReferralSchema.safeParse(req.body);
      
      if (!validation.success) {
        return res.status(400).json({ message: "Invalid referral code", errors: validation.error.errors });
      }
      
      const { code } = validation.data;
      
      // Check if referral code exists
      const referral = await storage.getReferral(code);
      if (!referral) {
        return res.status(404).json({ message: "Referral code not found" });
      }
      
      // Check if referring self
      if (referral.user_id === userId) {
        return res.status(400).json({ message: "Cannot use your own referral code" });
      }
      
      // Record referral use
      await storage.createReferralUse({
        id: uuidv4(),
        code,
        referred_user: userId,
        used_at: new Date()
      });
      
      // Получаем пользователя-реферера
      const referrer = await storage.getUser(referral.user_id);
      if (referrer) {
        // Добавляем бонус рефереру при первой активации кода
        const bonusAmount = Number(referral.bonus_amount) || 50;
        await storage.updateUser(referral.user_id, {
          balance_stars: referrer.balance_stars + bonusAmount
        });
        
        // Создаем транзакцию для рефера
        await storage.createTransaction({
          id: uuidv4(),
          user_id: referral.user_id,
          amount: bonusAmount,
          type: "referral",
          description: `Referral bonus from ${req.user!.username}`,
          created_at: new Date()
        });
      }
      
      res.json({ success: true, message: "Referral code applied successfully" });
    } catch (error) {
      console.error("Error applying referral code:", error);
      res.status(500).json({ message: "Failed to apply referral code" });
    }
  });
}
