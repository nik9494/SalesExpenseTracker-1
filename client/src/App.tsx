import { Switch, Route } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/home";
import WaitingRoomPage from "@/pages/waiting-room";
import GameRoomPage from "@/pages/game-room";
import GameResultsPage from "@/pages/game-results";
import BonusRoomPage from "@/pages/bonus-room";
import HeroRoomPage from "@/pages/hero-room";
import CreateHeroRoomPage from "@/pages/create-hero-room";
import ProfilePage from "@/pages/profile";
import LeaderboardPage from "@/pages/leaderboard";
import BottomNavigation from "@/components/layout/BottomNavigation";
import { useTelegram } from "@/hooks/useTelegram";
import { useEffect } from "react";

function App() {
  const { initTelegram } = useTelegram();

  useEffect(() => {
    // Initialize Telegram Web App
    initTelegram();
  }, [initTelegram]);

  return (
    <TooltipProvider>
      <div className="max-w-md mx-auto bg-white min-h-screen relative shadow-md">
        <Toaster />
        
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/waiting-room/:roomId" component={WaitingRoomPage} />
          <Route path="/game-room/:roomId" component={GameRoomPage} />
          <Route path="/game-results/:gameId" component={GameResultsPage} />
          <Route path="/bonus-room" component={BonusRoomPage} />
          <Route path="/hero-room" component={HeroRoomPage} />
          <Route path="/create-hero-room" component={CreateHeroRoomPage} />
          <Route path="/profile" component={ProfilePage} />
          <Route path="/leaderboard" component={LeaderboardPage} />
          <Route component={NotFound} />
        </Switch>
        
        <BottomNavigation />
      </div>
    </TooltipProvider>
  );
}

export default App;
