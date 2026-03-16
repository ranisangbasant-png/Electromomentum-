/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Zap, 
  CloudRain, 
  CloudLightning, 
  Wind, 
  Sun, 
  Cloud,
  Snowflake,
  Users, 
  ShieldCheck, 
  MapPin, 
  ThumbsUp, 
  CheckCircle2,
  Camera,
  Loader2,
  AlertTriangle,
  Search,
  MessageSquare,
  Sparkles,
  X,
  Send,
  Info,
  CreditCard,
  Globe,
  DollarSign,
  Award,
  Crown,
  Lock,
  RefreshCw
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { GoogleGenAI } from "@google/genai";
import Markdown from 'react-markdown';
import { cn } from './lib/utils';
import { translations, Language } from './translations';

type Role = 'consumer' | 'board' | 'owner' | null;

interface Report {
  id: number;
  area: string;
  weather: string;
  latitude?: number;
  longitude?: number;
  status: string;
  votes: number;
  created_at: string;
  isTransformerBurnt?: boolean;
  imageUrl?: string;
}

interface Payment {
  id: number;
  consumer_name: string;
  account_number: string;
  amount: number;
  status: string;
  created_at: string;
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

interface Board {
  id: number;
  name: string;
  subscription_status: 'paid' | 'unpaid';
  is_blocked: number;
  created_at: string;
}

interface GridMessage {
  id: number;
  board_name: string;
  area: string;
  reason: string;
  estimated_restoration: string;
  created_at: string;
}

const WEATHER_OPTIONS = [
  { id: 'clear', label: 'clearSky', icon: Sun, color: 'text-yellow-500', bg: 'bg-yellow-50' },
  { id: 'rain', label: 'heavyRain', icon: CloudRain, color: 'text-blue-500', bg: 'bg-blue-50' },
  { id: 'storm', label: 'thunderstorm', icon: CloudLightning, color: 'text-purple-500', bg: 'bg-purple-50' },
  { id: 'wind', label: 'strongWind', icon: Wind, color: 'text-slate-500', bg: 'bg-slate-50' },
  { id: 'fog', label: 'foggy', icon: Cloud, color: 'text-gray-400', bg: 'bg-gray-50' },
  { id: 'snow', label: 'snowing', icon: Snowflake, color: 'text-cyan-400', bg: 'bg-cyan-50' },
];

const Logo = ({ className = "w-8 h-8" }: { className?: string }) => (
  <div className={cn("relative flex items-center justify-center", className)}>
    <div className="absolute inset-0 bg-yellow-400 rounded-lg rotate-12 opacity-20 animate-pulse" />
    <div className="absolute inset-0 bg-yellow-500 rounded-lg -rotate-6 opacity-20" />
    <div className="relative bg-black rounded-xl p-1.5 shadow-lg">
      <Zap className="w-full h-full text-yellow-400 fill-yellow-400" />
    </div>
  </div>
);

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [role, setRole] = useState<Role>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [area, setArea] = useState('');
  const [selectedWeather, setSelectedWeather] = useState('');
  const [isTransformerBurnt, setIsTransformerBurnt] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Location state
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Notification state
  const [newReportsCount, setNewReportsCount] = useState(0);
  
  // Chatbot state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Maps Insight state
  const [insightArea, setInsightArea] = useState<string | null>(null);
  const [insightContent, setInsightContent] = useState<string | null>(null);
  const [isLoadingInsight, setIsLoadingInsight] = useState(false);
  const [lang, setLang] = useState<Language>('en');

  // Payment state
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [billPaymentData, setBillPaymentData] = useState({
    consumerName: '',
    accountNumber: '',
    amount: ''
  });
  const [isPaying, setIsPaying] = useState(false);

  const [isVerifyingOwner, setIsVerifyingOwner] = useState(false);
  const [ownerEmailInput, setOwnerEmailInput] = useState('');

  // Board Management state
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<Board | null>(null);
  const [isVerifyingBoard, setIsVerifyingBoard] = useState(false);
  const [boardNameInput, setBoardNameInput] = useState('');
  const [boardAccessError, setBoardAccessError] = useState<string | null>(null);
  const [isAddingBoard, setIsAddingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');

  // Messaging state
  const [gridMessages, setGridMessages] = useState<GridMessage[]>([]);
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
  const [broadcastData, setBroadcastData] = useState({
    area: '',
    reason: '',
    estimatedRestoration: ''
  });
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  // AI Routine state
  const [gridRoutine, setGridRoutine] = useState<string | null>(null);
  const [isGeneratingRoutine, setIsGeneratingRoutine] = useState(false);

  const t = (key: keyof typeof translations['en']) => {
    return translations[lang][key] || translations['en'][key];
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 5000);

    setNewReportsCount(0); // Reset count on role change
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('reports_updated', (updatedReports: Report[]) => {
      setReports(prev => {
        // If we are on the board and the number of reports increased, notify
        if (role === 'board' && updatedReports.length > prev.length) {
          const diff = updatedReports.length - prev.length;
          setNewReportsCount(c => c + diff);
        }
        return updatedReports;
      });
    });

    newSocket.on('messages_updated', (updatedMessages: GridMessage[]) => {
      setGridMessages(updatedMessages);
    });

    fetchGridMessages();

    if (role === 'board') {
      fetchPayments();
      const paymentInterval = setInterval(fetchPayments, 30000);
      return () => {
        clearInterval(paymentInterval);
        clearTimeout(timer);
        newSocket.close();
      };
    }

    if (role === 'owner') {
      fetchAdminBoards();
    }

    // Check for payment status in URL
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('bill_payment') === 'success') {
      alert(t('paymentSuccess'));
      window.history.replaceState({}, document.title, "/");
    } else if (urlParams.get('bill_payment') === 'cancel') {
      alert(t('paymentCancel'));
      window.history.replaceState({}, document.title, "/");
    }

    return () => {
      clearTimeout(timer);
      newSocket.close();
    };
  }, [role, lang]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const clearNotifications = () => {
    setNewReportsCount(0);
  };

  const handleGetLocation = () => {
    setIsGettingLocation(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          setIsGettingLocation(false);
        },
        (error) => {
          console.error("Error getting location:", error);
          setIsGettingLocation(false);
          alert("Could not get your location. Please try again or enter area manually.");
        }
      );
    } else {
      alert("Geolocation is not supported by your browser.");
      setIsGettingLocation(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const fetchPayments = async () => {
    try {
      const res = await fetch('/api/payments');
      const data = await res.json();
      setPayments(data);
    } catch (err) {
      console.error("Error fetching payments:", err);
    }
  };

  const fetchGridMessages = async () => {
    try {
      const res = await fetch('/api/messages');
      const data = await res.json();
      setGridMessages(data);
    } catch (err) {
      console.error("Error fetching messages:", err);
    }
  };

  const fetchAdminBoards = async () => {
    try {
      const res = await fetch('/api/boards');
      const data = await res.json();
      setBoards(data);
    } catch (err) {
      console.error("Error fetching boards:", err);
    }
  };

  const handleToggleBoardBlock = async (id: number, currentBlocked: number) => {
    try {
      await fetch('/api/admin/boards/toggle-block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_blocked: !currentBlocked }),
      });
      fetchAdminBoards();
    } catch (err) {
      console.error("Error toggling board block:", err);
    }
  };

  const handleUpdateBoardSubscription = async (id: number, status: 'paid' | 'unpaid') => {
    try {
      await fetch('/api/admin/boards/update-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      fetchAdminBoards();
    } catch (err) {
      console.error("Error updating board subscription:", err);
    }
  };

  const handleAddBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoardName.trim()) return;
    try {
      const res = await fetch('/api/admin/boards/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newBoardName }),
      });
      if (res.ok) {
        setNewBoardName('');
        setIsAddingBoard(false);
        fetchAdminBoards();
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (err) {
      console.error("Error adding board:", err);
    }
  };

  const handleVerifyBoard = async () => {
    setBoardAccessError(null);
    try {
      const res = await fetch(`/api/boards/check/${encodeURIComponent(boardNameInput)}`);
      const data = await res.json();
      if (res.ok) {
        setSelectedBoard(data);
        setRole('board');
        setIsVerifyingBoard(false);
      } else {
        setBoardAccessError(data.error);
      }
    } catch (err) {
      setBoardAccessError("Error verifying board access.");
    }
  };

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBoard || !broadcastData.area || !broadcastData.reason) return;

    setIsBroadcasting(true);
    try {
      await fetch('/api/board/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boardName: selectedBoard.name,
          area: broadcastData.area,
          reason: broadcastData.reason,
          estimatedRestoration: broadcastData.estimatedRestoration
        }),
      });
      setIsBroadcastModalOpen(false);
      setBroadcastData({ area: '', reason: '', estimatedRestoration: '' });
    } catch (err) {
      console.error("Broadcast error:", err);
      alert("Error sending broadcast.");
    } finally {
      setIsBroadcasting(false);
    }
  };

  const generateGridRoutine = async () => {
    setIsGeneratingRoutine(true);
    setGridRoutine(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          { role: 'user', parts: [{ text: `Generate a comprehensive daily setup and maintenance routine for an electricity grid management team. The routine should include safety checks, grid monitoring, transformer inspections, and consumer communication protocols. Current grid status: ${reports.length} active outages. Format as a structured list.` }] }
        ],
        config: {
          systemInstruction: "You are an expert Grid Operations Consultant. Provide a highly professional, actionable, and safety-focused maintenance routine for electricity boards."
        }
      });
      setGridRoutine(response.text || "Failed to generate routine.");
    } catch (error) {
      console.error("Routine generation error:", error);
      setGridRoutine("Error generating routine. Please check your connection.");
    } finally {
      setIsGeneratingRoutine(false);
    }
  };

  const handlePayBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billPaymentData.consumerName || !billPaymentData.accountNumber || !billPaymentData.amount) return;

    setIsPaying(true);
    try {
      const res = await fetch('/api/pay-bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consumerName: billPaymentData.consumerName,
          accountNumber: billPaymentData.accountNumber,
          amount: parseFloat(billPaymentData.amount)
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.success) {
        alert(data.message || t('paymentSuccess'));
        setIsPaymentModalOpen(false);
        setBillPaymentData({ consumerName: '', accountNumber: '', amount: '' });
      }
    } catch (err) {
      console.error("Payment error:", err);
      alert("Error processing payment. Please try again.");
    } finally {
      setIsPaying(false);
    }
  };

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!area || !selectedWeather) return;

    setIsSubmitting(true);
    try {
      await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          area, 
          weather: selectedWeather,
          latitude: location?.lat,
          longitude: location?.lng,
          isTransformerBurnt,
          imageUrl: imagePreview
        }),
      });
      setArea('');
      setSelectedWeather('');
      setLocation(null);
      setIsTransformerBurnt(false);
      setImagePreview(null);
    } catch (error) {
      console.error('Failed to report:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestore = async (id: number) => {
    try {
      await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch (error) {
      console.error('Failed to restore:', error);
    }
  };

  const sendMessage = async () => {
    if (!userInput.trim()) return;

    const newMessages: ChatMessage[] = [...chatMessages, { role: 'user', text: userInput }];
    setChatMessages(newMessages);
    setUserInput('');
    setIsTyping(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: [
          { role: 'user', parts: [{ text: `You are the ElectroMomentum Grid Assistant. Help the user with power outage questions. Current grid status: ${reports.length} active outages. Reports: ${JSON.stringify(reports)}. User message: ${userInput}` }] }
        ],
        config: {
          systemInstruction: "You are a helpful assistant for ElectroMomentum, a platform for reporting and managing power outages. Be professional, concise, and informative. Users can now report 'Transformer Burnt' incidents with photos, which are prioritized for the Electricity Board."
        }
      });

      setChatMessages([...newMessages, { role: 'model', text: response.text || "I'm sorry, I couldn't process that." }]);
    } catch (error) {
      console.error("Chat error:", error);
      setChatMessages([...newMessages, { role: 'model', text: "Error connecting to the Grid Assistant." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const getAreaInsight = async (areaName: string) => {
    setInsightArea(areaName);
    setInsightContent(null);
    setIsLoadingInsight(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Provide a brief summary of the area "${areaName}" including its general location and any notable landmarks or infrastructure that might be relevant for electricity restoration. Use Google Maps data.`,
        config: {
          tools: [{ googleMaps: {} }]
        }
      });

      setInsightContent(response.text || "No insights available for this area.");
    } catch (error) {
      console.error("Insight error:", error);
      setInsightContent("Failed to load area insights.");
    } finally {
      setIsLoadingInsight(false);
    }
  };

  const filteredReports = reports.filter(report => 
    report.area.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (showSplash) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center overflow-hidden">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="relative"
        >
          <Zap className="w-24 h-24 text-yellow-400 fill-yellow-400 animate-pulse" />
          <motion.div
            className="absolute -inset-4 bg-yellow-400/20 blur-3xl rounded-full"
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </motion.div>
        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="mt-8 text-5xl font-black tracking-tighter text-white uppercase italic"
        >
          ElectroMomentum
        </motion.h1>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: "200px" }}
          transition={{ delay: 1, duration: 3.5, ease: "linear" }}
          className="mt-4 h-1 bg-yellow-400 rounded-full"
        />
      </div>
    );
  }

  if (!role) {
    return (
      <div className="min-h-screen bg-[#E4E3E0] flex flex-col items-center justify-center p-6 font-sans overflow-hidden">
        <div className="mb-16 text-center relative">
          <motion.div
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="flex flex-col items-center"
          >
            <h2 className="text-4xl sm:text-6xl md:text-8xl font-black uppercase tracking-tighter italic leading-[0.8] text-black mb-2">
              {t('saveElectricity')}
            </h2>
            <h2 className="text-4xl sm:text-6xl md:text-8xl font-black uppercase tracking-tighter italic leading-[0.8] text-orange-500 mb-2">
              {t('saveEnergy')}
            </h2>
            <h2 className="text-4xl sm:text-6xl md:text-8xl font-black uppercase tracking-tighter italic leading-[0.8] text-black/10">
              {t('saveResources')}
            </h2>
          </motion.div>
          
          <motion.div 
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.5, duration: 1 }}
            className="h-2 bg-black w-full mt-6 origin-left"
          />
        </div>

        <div className="max-w-6xl w-full grid md:grid-cols-3 gap-8 relative z-10">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setRole('consumer')}
            className="group relative bg-white p-12 rounded-3xl border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col items-center text-center transition-all hover:shadow-none hover:translate-x-1 hover:translate-y-1"
          >
            <div className="w-20 h-20 bg-blue-100 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-blue-200 transition-colors">
              <Users className="w-10 h-10 text-blue-600" />
            </div>
            <h2 className="text-3xl font-bold mb-4">{t('consumer')}</h2>
            <p className="text-gray-600">{t('consumerDesc')}</p>
          </motion.button>

          <div className="relative">
            {!isVerifyingBoard ? (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsVerifyingBoard(true)}
                className="w-full h-full group relative bg-black p-12 rounded-3xl border-2 border-black shadow-[8px_8px_0px_0px_rgba(242,125,38,1)] flex flex-col items-center text-center transition-all hover:shadow-none hover:translate-x-1 hover:translate-y-1"
              >
                <div className="w-20 h-20 bg-orange-500/20 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-orange-500/30 transition-colors">
                  <ShieldCheck className="w-10 h-10 text-orange-500" />
                </div>
                <h2 className="text-3xl font-bold mb-4 text-white">{t('board')}</h2>
                <p className="text-gray-400">{t('boardDesc')}</p>
              </motion.button>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-black p-8 rounded-3xl border-2 border-black shadow-[8px_8px_0px_0px_rgba(242,125,38,1)] flex flex-col items-center text-center h-full"
              >
                <div className="w-16 h-16 bg-orange-500/20 rounded-2xl flex items-center justify-center mb-6">
                  <ShieldCheck className="w-8 h-8 text-orange-500" />
                </div>
                <h2 className="text-2xl font-bold mb-4 text-white">{t('boardLogin')}</h2>
                <input 
                  type="text"
                  value={boardNameInput}
                  onChange={(e) => setBoardNameInput(e.target.value)}
                  placeholder={t('enterBoardName')}
                  className="w-full px-4 py-3 bg-white/10 border border-white/10 text-white rounded-xl mb-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                {boardAccessError && (
                  <p className="text-red-400 text-xs mb-4 font-bold">{boardAccessError}</p>
                )}
                <div className="flex gap-2 w-full mt-auto">
                  <button 
                    onClick={() => {
                      setIsVerifyingBoard(false);
                      setBoardAccessError(null);
                    }}
                    className="flex-1 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-white transition-all"
                  >
                    {t('close')}
                  </button>
                  <button 
                    onClick={handleVerifyBoard}
                    className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold transition-all"
                  >
                    {t('verify')}
                  </button>
                </div>
              </motion.div>
            )}
          </div>

          <div className="relative">
            {!isVerifyingOwner ? (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsVerifyingOwner(true)}
                className="w-full h-full group relative bg-white p-12 rounded-3xl border-2 border-black shadow-[8px_8px_0px_0px_rgba(147,51,234,1)] flex flex-col items-center text-center transition-all hover:shadow-none hover:translate-x-1 hover:translate-y-1"
              >
                <div className="w-20 h-20 bg-purple-100 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-purple-200 transition-colors">
                  <Crown className="w-10 h-10 text-purple-600" />
                </div>
                <h2 className="text-3xl font-bold mb-4">{t('appOwner')}</h2>
                <p className="text-gray-600">Manage global subscriptions, view platform analytics, and manage owner profile.</p>
              </motion.button>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white p-8 rounded-3xl border-2 border-black shadow-[8px_8px_0px_0px_rgba(147,51,234,1)] flex flex-col items-center text-center h-full"
              >
                <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center mb-6">
                  <Lock className="w-8 h-8 text-purple-600" />
                </div>
                <h2 className="text-2xl font-bold mb-4">{t('ownerLogin')}</h2>
                <input 
                  type="email"
                  value={ownerEmailInput}
                  onChange={(e) => setOwnerEmailInput(e.target.value)}
                  placeholder={t('enterOwnerEmail')}
                  className="w-full px-4 py-3 bg-gray-50 border border-black/10 rounded-xl mb-4 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <div className="flex gap-2 w-full">
                  <button 
                    onClick={() => setIsVerifyingOwner(false)}
                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold text-gray-600 transition-all"
                  >
                    {t('close')}
                  </button>
                  <button 
                    onClick={() => {
                      if (ownerEmailInput === t('ownerEmail')) {
                        setRole('owner');
                        setIsVerifyingOwner(false);
                      } else {
                        alert(t('invalidEmail'));
                      }
                    }}
                    className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold transition-all"
                  >
                    Verify
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F0] font-sans overflow-x-hidden">
      {/* Header */}
      <header className="bg-white border-b border-black/10 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setRole(null)}>
          <Logo className="w-10 h-10 group-hover:rotate-12 transition-transform duration-300" />
          <div className="flex flex-col">
            <span className="font-black uppercase italic tracking-tighter text-xl leading-none">ElectroMomentum</span>
            <span className="text-[10px] font-bold text-gray-400 tracking-[0.2em] uppercase">Grid Management</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <select 
            value={lang} 
            onChange={(e) => setLang(e.target.value as Language)}
            className="bg-gray-100 border-none rounded-xl px-3 py-2 text-sm font-bold text-gray-600 focus:ring-0 cursor-pointer"
          >
            <option value="en">English</option>
            <option value="hi">हिंदी</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
            <option value="zh">中文</option>
            <option value="ar">العربية</option>
          </select>
          <span className={cn(
            "hidden sm:inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
            role === 'consumer' ? "bg-blue-100 text-blue-700" : 
            role === 'board' ? "bg-orange-100 text-orange-700" : "bg-purple-100 text-purple-700"
          )}>
            {role === 'consumer' ? t('consumer') : role === 'board' ? t('board') : 'Owner Access'}
          </span>
          <button 
            onClick={() => setRole(null)}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-bold text-gray-600 transition-all active:scale-95"
          >
            {t('switchRole')}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 grid lg:grid-cols-12 gap-8">
        {/* Left Column: Reporting / Stats / Owner Profile */}
        <div className="lg:col-span-5 space-y-8">
          {role === 'owner' ? (
            <div className="space-y-8">
              {/* Owner Profile Card */}
              <div className="bg-white rounded-3xl p-8 border border-black/5 shadow-sm">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center">
                    <Crown className="w-8 h-8 text-purple-600" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">{t('appOwner')}</h2>
                    <p className="text-sm font-medium text-purple-600">{t('ownerEmail')}</p>
                    <p className="text-xs text-gray-400">{t('globalAdmin')}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <Globe className="w-5 h-5 text-gray-400" />
                      <span className="text-sm font-medium">Global Reach</span>
                    </div>
                    <span className="text-sm font-bold">142 Countries</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                    <div className="flex items-center gap-3">
                      <Award className="w-5 h-5 text-gray-400" />
                      <span className="text-sm font-medium">Platform Status</span>
                    </div>
                    <span className="text-sm font-bold text-green-600">Verified</span>
                  </div>
                </div>
              </div>

              {/* Payment Card */}
              <div className="bg-black text-white rounded-3xl p-8 border border-white/10 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                  <DollarSign className="w-32 h-32" />
                </div>
                <h3 className="text-xl font-bold mb-2">Global Subscriptions</h3>
                <p className="text-gray-400 text-sm mb-6">Accept monthly payments from electricity boards worldwide to access advanced grid management tools.</p>
                
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 mb-6">
                  <div className="flex items-end gap-2 mb-4">
                    <span className="text-4xl font-black">$10,000</span>
                    <span className="text-gray-400 text-sm mb-1">/ month per board</span>
                  </div>
                  <ul className="space-y-3">
                    <li className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                      Real-time Grid Analytics
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                      AI-Powered Restoration Insights
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                      Global Priority Support
                    </li>
                  </ul>
                </div>

                <button 
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/create-checkout-session', { method: 'POST' });
                      const data = await res.json();
                      if (data.url) window.location.href = data.url;
                    } catch (err) {
                      console.error("Payment error:", err);
                      alert("Stripe is not configured. Please add STRIPE_SECRET_KEY to your environment.");
                    }
                  }}
                  className="w-full py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2"
                >
                  <CreditCard className="w-5 h-5" />
                  Subscribe a New Board
                </button>
              </div>
            </div>
          ) : role === 'consumer' ? (
            <div className="bg-white rounded-3xl p-8 border border-black/5 shadow-sm">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <AlertTriangle className="text-red-500" />
                {t('reportPowerCut')}
              </h2>
              <form onSubmit={handleReport} className="space-y-6">
                <div>
                  <label className="block text-sm font-bold uppercase tracking-wider text-gray-500 mb-2">{t('areaLocality')}</label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input 
                      type="text" 
                      value={area}
                      onChange={(e) => setArea(e.target.value)}
                      placeholder={t('enterArea')}
                      className="w-full pl-12 pr-4 py-4 bg-gray-50 border border-black/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-yellow-400 transition-all"
                      required
                    />
                  </div>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="bg-yellow-400 p-2 rounded-xl shrink-0">
                      <MapPin className="w-5 h-5 text-black" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-sm text-yellow-900">{t('pinExactLocation')}</h4>
                      <p className="text-xs text-yellow-800 mb-3">{t('taggingHelp')}</p>
                      <button
                        type="button"
                        onClick={handleGetLocation}
                        disabled={isGettingLocation}
                        className={cn(
                          "w-full py-2 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2",
                          location 
                            ? "bg-green-500 text-white" 
                            : "bg-white text-black border border-yellow-400 hover:bg-yellow-400"
                        )}
                      >
                        {isGettingLocation ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : location ? (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            {t('locationPinned')}
                          </>
                        ) : (
                          t('tagMyLocation')
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold uppercase tracking-wider text-gray-500 mb-2">{t('currentWeather')}</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {WEATHER_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setSelectedWeather(option.id)}
                        className={cn(
                          "flex flex-col items-center gap-3 p-4 rounded-2xl border-2 transition-all",
                          selectedWeather === option.id 
                            ? "border-yellow-400 bg-yellow-50" 
                            : "border-transparent bg-gray-50 hover:bg-gray-100"
                        )}
                      >
                        <option.icon className={cn("w-8 h-8", option.color)} />
                        <span className="text-xs font-semibold text-center">{t(option.label as any)}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-red-50 border border-red-100 rounded-2xl p-6">
                  <div className="flex items-start gap-4">
                    <div className="bg-red-500 p-3 rounded-xl shrink-0">
                      <Zap className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-bold text-red-900">{t('transformerBurnt')}</h4>
                        <button
                          type="button"
                          onClick={() => setIsTransformerBurnt(!isTransformerBurnt)}
                          className={cn(
                            "w-12 h-6 rounded-full transition-all relative",
                            isTransformerBurnt ? "bg-red-500" : "bg-gray-300"
                          )}
                        >
                          <div className={cn(
                            "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                            isTransformerBurnt ? "right-1" : "left-1"
                          )} />
                        </button>
                      </div>
                      <p className="text-xs text-red-800 mb-4">{t('transformerBurntHelp')}</p>
                      
                      {isTransformerBurnt && (
                        <div className="space-y-4">
                          <div className="relative group">
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              onChange={handleImageChange}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            />
                            <div className="border-2 border-dashed border-red-200 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 group-hover:bg-red-100/50 transition-all">
                              {imagePreview ? (
                                <img src={imagePreview} alt="Preview" className="w-full h-32 object-cover rounded-xl" />
                              ) : (
                                <>
                                  <Camera className="w-8 h-8 text-red-400" />
                                  <span className="text-xs font-bold text-red-600">Click to Take Photo</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-black text-white py-4 rounded-2xl font-bold text-lg hover:bg-gray-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" /> : <ThumbsUp className="w-5 h-5" />}
                  {isSubmitting ? 'Reporting...' : 'Submit Report & Vote'}
                </button>
              </form>

              <div className="mt-8 pt-8 border-t border-black/5 space-y-4">
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6">
                  <h3 className="font-bold text-blue-900 mb-4 flex items-center gap-2">
                    <MessageSquare className="w-5 h-5" />
                    {t('boardAlerts')}
                  </h3>
                  <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                    {gridMessages.length === 0 ? (
                      <p className="text-xs text-blue-700 italic">{t('noAlerts')}</p>
                    ) : (
                      gridMessages.map((msg) => (
                        <div key={msg.id} className="p-3 bg-white rounded-xl border border-blue-200 shadow-sm">
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-[10px] font-black text-blue-600 uppercase tracking-tighter">{msg.board_name}</span>
                            <span className="text-[10px] text-gray-400">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <p className="text-xs font-bold text-gray-800 mb-1">{msg.area}</p>
                          <p className="text-xs text-gray-600 leading-relaxed">{msg.reason}</p>
                          {msg.estimated_restoration && (
                            <div className="mt-2 pt-2 border-t border-blue-50 flex items-center gap-1 text-[10px] font-bold text-blue-700">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              {t('estimatedRestoration')}: {msg.estimated_restoration}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <button 
                  onClick={() => setIsPaymentModalOpen(true)}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2"
                >
                  <CreditCard className="w-5 h-5" />
                  {t('payBill')}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-black text-white rounded-3xl p-8">
                <h2 className="text-xl font-bold mb-2 opacity-60 uppercase tracking-widest text-xs">Active Outages</h2>
                <div className="text-6xl font-black italic">{reports.length}</div>
                <div className="mt-4 flex items-center gap-2 text-green-400 text-sm font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  Grid monitoring active
                </div>
              </div>

              <div className="bg-white rounded-3xl p-8 border border-black/5 shadow-sm">
                <h3 className="font-bold mb-4 uppercase tracking-wider text-xs text-gray-500">{t('quickActions')}</h3>
                <div className="grid gap-3">
                  <button 
                    onClick={() => setIsBroadcastModalOpen(true)}
                    className="w-full text-left p-4 bg-orange-50 rounded-2xl hover:bg-orange-100 transition-all font-semibold flex items-center justify-between group"
                  >
                    <span className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-orange-500" />
                      {t('broadcastReason')}
                    </span>
                    <Send className="w-4 h-4 text-orange-500 group-hover:translate-x-1 transition-transform" />
                  </button>
                  <button className="w-full text-left p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-all font-semibold flex items-center justify-between">
                    {t('broadcastAlert')}
                    <AlertTriangle className="w-4 h-4 text-orange-500" />
                  </button>
                  <button className="w-full text-left p-4 bg-gray-50 rounded-2xl hover:bg-gray-100 transition-all font-semibold flex items-center justify-between">
                    {t('maintenanceSchedule')}
                    <Loader2 className="w-4 h-4 text-blue-500" />
                  </button>
                </div>
              </div>

              {/* AI Grid Maintenance Routine Section */}
              <div className="bg-white rounded-3xl p-8 border border-black/5 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-indigo-100 rounded-2xl">
                      <Sparkles className="w-6 h-6 text-indigo-600" />
                    </div>
                    <h3 className="text-xl font-bold">AI Grid Routine</h3>
                  </div>
                  <button 
                    onClick={generateGridRoutine}
                    disabled={isGeneratingRoutine}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {isGeneratingRoutine ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    {gridRoutine ? 'Regenerate' : 'Generate Routine'}
                  </button>
                </div>

                {isGeneratingRoutine ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center">
                    <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-gray-500 font-medium animate-pulse">AI is analyzing grid status and crafting your routine...</p>
                  </div>
                ) : gridRoutine ? (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-indigo-50/50 rounded-2xl p-6 border border-indigo-100"
                  >
                    <div className="prose prose-sm max-w-none text-indigo-900 leading-relaxed">
                      <Markdown>{gridRoutine}</Markdown>
                    </div>
                  </motion.div>
                ) : (
                  <div className="py-8 text-center border-2 border-dashed border-gray-100 rounded-3xl">
                    <p className="text-gray-400 text-sm">No routine generated yet. Click the button above to create an AI-powered maintenance schedule.</p>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-3xl p-8 border border-black/5 shadow-sm">
                <h3 className="font-bold mb-4 uppercase tracking-wider text-xs text-gray-500">{t('billPayment')}</h3>
                <p className="text-xs text-gray-400 mb-6">{t('boardPaymentsDesc')}</p>
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {payments.length === 0 ? (
                    <div className="text-center py-8">
                      <CreditCard className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                      <p className="text-sm text-gray-400">{t('noPayments')}</p>
                    </div>
                  ) : (
                    payments.map((payment) => (
                      <div key={payment.id} className="p-4 bg-gray-50 rounded-2xl border border-black/5">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-bold text-sm">{payment.consumer_name}</p>
                            <p className="text-[10px] text-gray-400 uppercase tracking-tighter">ACC: {payment.account_number}</p>
                          </div>
                          <span className="text-sm font-black text-green-600">${payment.amount}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-gray-400">{new Date(payment.created_at).toLocaleDateString()}</span>
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-[10px] font-bold uppercase tracking-widest">
                            {payment.status}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Live Feed / Owner Analytics */}
        <div className="lg:col-span-7">
          {role === 'owner' ? (
            <div className="space-y-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">{t('platformAnalytics')}</h2>
                <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest">
                  <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                  {t('liveData')}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-6">
                <div className="bg-white p-8 rounded-3xl border border-black/5 shadow-sm">
                  <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">{t('totalRevenue')}</p>
                  <p className="text-4xl font-black tracking-tighter">$12,480</p>
                  <div className="mt-4 flex items-center gap-2 text-green-600 text-sm font-bold">
                    <ThumbsUp className="w-4 h-4" />
                    +12% from last month
                  </div>
                </div>
                <div className="bg-white p-8 rounded-3xl border border-black/5 shadow-sm">
                  <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">{t('activeBoards')}</p>
                  <p className="text-4xl font-black tracking-tighter">{boards.length}</p>
                  <div className="mt-4 flex items-center gap-2 text-blue-600 text-sm font-bold">
                    <Globe className="w-4 h-4" />
                    Across {Math.ceil(boards.length / 2)} continents
                  </div>
                </div>
              </div>

              {/* Board Management Section */}
              <div className="bg-white rounded-3xl p-8 border border-black/5 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-bold">{t('boardManagement')}</h3>
                  <button 
                    onClick={() => setIsAddingBoard(true)}
                    className="px-4 py-2 bg-black text-white rounded-xl text-xs font-bold hover:bg-gray-800 transition-all"
                  >
                    + {t('addNewBoard')}
                  </button>
                </div>

                {isAddingBoard && (
                  <motion.form 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onSubmit={handleAddBoard}
                    className="mb-6 p-4 bg-gray-50 rounded-2xl border border-black/5 flex gap-2"
                  >
                    <input 
                      type="text"
                      value={newBoardName}
                      onChange={(e) => setNewBoardName(e.target.value)}
                      placeholder={t('enterBoardName')}
                      className="flex-1 px-4 py-2 bg-white border border-black/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                      required
                    />
                    <button type="submit" className="px-4 py-2 bg-purple-600 text-white rounded-xl font-bold text-sm">{t('verify')}</button>
                    <button type="button" onClick={() => setIsAddingBoard(false)} className="px-4 py-2 bg-gray-200 text-gray-600 rounded-xl font-bold text-sm">{t('close')}</button>
                  </motion.form>
                )}

                <div className="space-y-4">
                  {boards.map((board) => (
                    <div key={board.id} className="p-4 bg-gray-50 rounded-2xl border border-black/5 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center",
                          board.is_blocked ? "bg-red-100" : "bg-green-100"
                        )}>
                          <ShieldCheck className={cn("w-5 h-5", board.is_blocked ? "text-red-500" : "text-green-500")} />
                        </div>
                        <div>
                          <p className="font-bold text-sm">{board.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={cn(
                              "text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-tighter",
                              board.subscription_status === 'paid' ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"
                            )}>
                              {t(board.subscription_status as any)}
                            </span>
                            {board.is_blocked === 1 && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-tighter bg-red-100 text-red-700">
                                {t('blocked')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <select 
                          value={board.subscription_status}
                          onChange={(e) => handleUpdateBoardSubscription(board.id, e.target.value as 'paid' | 'unpaid')}
                          className="text-xs font-bold bg-white border border-black/10 rounded-lg px-2 py-1 focus:outline-none"
                        >
                          <option value="paid">{t('paid')}</option>
                          <option value="unpaid">{t('unpaid')}</option>
                        </select>
                        <button 
                          onClick={() => handleToggleBoardBlock(board.id, board.is_blocked)}
                          className={cn(
                            "px-3 py-1 rounded-lg text-xs font-bold transition-all",
                            board.is_blocked 
                              ? "bg-green-500 text-white hover:bg-green-600" 
                              : "bg-red-500 text-white hover:bg-red-600"
                          )}
                        >
                          {board.is_blocked ? t('grantAccess') : t('stopAccess')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-3xl p-8 border border-black/5 shadow-sm">
                <h3 className="text-xl font-bold mb-6">{t('recentPayments')}</h3>
                <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {payments.length === 0 ? (
                    <div className="text-center py-12">
                      <CreditCard className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                      <p className="text-gray-400">{t('noPayments')}</p>
                    </div>
                  ) : (
                    payments.map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between py-4 border-b border-gray-50 last:border-0">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
                            <Users className="w-5 h-5 text-purple-400" />
                          </div>
                          <div>
                            <p className="font-bold text-sm">{payment.consumer_name}</p>
                            <p className="text-xs text-gray-500">{payment.account_number} • {new Date(payment.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <span className="font-black text-green-600">${payment.amount}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-bold">{t('liveOutageFeed')}</h2>
              <AnimatePresence>
                {role === 'board' && newReportsCount > 0 && (
                  <motion.button
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    onClick={clearNotifications}
                    className="flex items-center gap-2 bg-orange-500 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg hover:bg-orange-600 transition-all"
                  >
                    <AlertTriangle className="w-3 h-3" />
                    {newReportsCount} {t('newReports')}
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              {t('liveUpdates')}
            </div>
          </div>

          {/* Search Bar (Board Only) */}
          {role === 'board' && (
            <div className="relative mb-6">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input 
                type="text"
                placeholder={t('searchReports')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white border border-black/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-yellow-400 transition-all shadow-sm"
              />
            </div>
          )}

          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {filteredReports.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-white rounded-3xl p-12 text-center border border-dashed border-black/10"
                >
                  <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <h3 className="text-xl font-bold mb-2">
                    {searchQuery ? t('noMatches') : t('allClear')}
                  </h3>
                  <p className="text-gray-500">
                    {searchQuery ? `${t('noMatches')} for "${searchQuery}"` : t('noReportsGrid')}
                  </p>
                </motion.div>
              ) : (
                filteredReports.map((report) => (
                  <motion.div
                    key={report.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white rounded-3xl p-6 border border-black/5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between group hover:border-yellow-400/50 transition-all gap-4"
                  >
                    <div className="flex items-center gap-6">
                      <div className={cn(
                        "w-16 h-16 rounded-2xl flex items-center justify-center relative shrink-0",
                        WEATHER_OPTIONS.find(w => w.id === report.weather)?.bg || "bg-gray-50"
                      )}>
                        {(() => {
                          const option = WEATHER_OPTIONS.find(w => w.id === report.weather);
                          const Icon = option?.icon || Sun;
                          return <Icon className={cn("w-8 h-8", option?.color || "text-gray-400")} />;
                        })()}
                        <div className="absolute -top-2 -right-2 bg-yellow-400 text-black text-[10px] font-black px-2 py-1 rounded-lg">
                          {report.votes} {t('votesCount')}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-xl font-bold">{report.area}</h3>
                          {report.isTransformerBurnt && (
                            <span className="bg-red-100 text-red-600 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-tighter flex items-center gap-1">
                              <Zap className="w-3 h-3 fill-red-600" />
                              {t('transformerBurntBadge')}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 flex items-center gap-2">
                          <span className="capitalize">{t(report.weather as any)}</span>
                          •
                          <span>{new Date(report.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {report.latitude && (
                            <>
                              •
                              <span className="flex items-center gap-1 text-blue-500 font-medium">
                                <MapPin className="w-3 h-3" />
                                {t('gpsTagged')}
                              </span>
                            </>
                          )}
                        </p>
                        {report.imageUrl && (
                          <div className="mt-3">
                            <img 
                              src={report.imageUrl} 
                              alt="Damage report" 
                              className="w-32 h-20 object-cover rounded-xl border border-black/5 cursor-pointer hover:scale-105 transition-transform"
                              onClick={() => window.open(report.imageUrl, '_blank')}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {role === 'board' && (
                        <>
                          <button
                            onClick={() => getAreaInsight(report.area)}
                            className="p-3 bg-gray-100 text-gray-600 rounded-2xl hover:bg-gray-200 transition-all"
                            title="Area Insight"
                          >
                            <Info className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleRestore(report.id)}
                            className="bg-green-500 text-white px-6 py-3 rounded-2xl font-bold hover:bg-green-600 transition-all flex items-center gap-2"
                          >
                            <Zap className="w-4 h-4 fill-white" />
                            Restore
                          </button>
                        </>
                      )}
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  </main>

      {/* Broadcast Modal */}
      <AnimatePresence>
        {isBroadcastModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-black/5"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-orange-100 rounded-2xl">
                    <MessageSquare className="w-6 h-6 text-orange-600" />
                  </div>
                  <h3 className="text-2xl font-bold">{t('broadcastReason')}</h3>
                </div>
                <button onClick={() => setIsBroadcastModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-all">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleBroadcast} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">{t('areaLocality')}</label>
                  <input 
                    type="text" 
                    value={broadcastData.area}
                    onChange={(e) => setBroadcastData({...broadcastData, area: e.target.value})}
                    placeholder="e.g. Downtown, Sector 5"
                    className="w-full px-4 py-3 bg-gray-50 border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">{t('reasonForCut')}</label>
                  <textarea 
                    value={broadcastData.reason}
                    onChange={(e) => setBroadcastData({...broadcastData, reason: e.target.value})}
                    placeholder="Explain the reason for the power cut..."
                    className="w-full px-4 py-3 bg-gray-50 border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 h-24 resize-none"
                    required
                  />
                  <div className="flex flex-wrap gap-2 mt-2">
                    {[t('maintenance'), t('fault'), t('loadShedding'), t('emergency')].map((r) => (
                      <button 
                        key={r}
                        type="button"
                        onClick={() => setBroadcastData({...broadcastData, reason: r})}
                        className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg text-[10px] font-bold text-gray-600 transition-all"
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">{t('estimatedRestoration')}</label>
                  <input 
                    type="text" 
                    value={broadcastData.estimatedRestoration}
                    onChange={(e) => setBroadcastData({...broadcastData, estimatedRestoration: e.target.value})}
                    placeholder="e.g. 2 Hours, 4:00 PM"
                    className="w-full px-4 py-3 bg-gray-50 border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isBroadcasting}
                  className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-4 shadow-lg shadow-orange-500/20"
                >
                  {isBroadcasting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  {isBroadcasting ? t('broadcasting') : t('broadcast')}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Bill Payment Modal */}
      <AnimatePresence>
        {isPaymentModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-black/5"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-100 rounded-2xl">
                    <CreditCard className="w-6 h-6 text-blue-600" />
                  </div>
                  <h3 className="text-2xl font-bold">{t('billPayment')}</h3>
                </div>
                <button onClick={() => setIsPaymentModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-all">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handlePayBill} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('consumerName')}</label>
                  <input 
                    type="text"
                    value={billPaymentData.consumerName}
                    onChange={(e) => setBillPaymentData({...billPaymentData, consumerName: e.target.value})}
                    placeholder="John Doe"
                    className="w-full px-4 py-3 bg-gray-50 border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('accountNumber')}</label>
                  <input 
                    type="text"
                    value={billPaymentData.accountNumber}
                    onChange={(e) => setBillPaymentData({...billPaymentData, accountNumber: e.target.value})}
                    placeholder="ACC-123456"
                    className="w-full px-4 py-3 bg-gray-50 border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{t('amountToPay')}</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">$</span>
                    <input 
                      type="number"
                      value={billPaymentData.amount}
                      onChange={(e) => setBillPaymentData({...billPaymentData, amount: e.target.value})}
                      placeholder="0.00"
                      step="0.01"
                      className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-black/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={isPaying}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-4"
                >
                  {isPaying ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
                  {t('payNow')}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Area Insight Modal */}
      <AnimatePresence>
        {insightArea && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl border border-black/5"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-100 rounded-2xl">
                    <Sparkles className="w-6 h-6 text-blue-600" />
                  </div>
                  <h3 className="text-2xl font-bold">Area Insight: {insightArea}</h3>
                </div>
                <button onClick={() => setInsightArea(null)} className="p-2 hover:bg-gray-100 rounded-full transition-all">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="prose prose-sm max-h-[60vh] overflow-y-auto">
                {isLoadingInsight ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                    <p className="text-gray-500 font-medium">Consulting Google Maps data...</p>
                  </div>
                ) : (
                  <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">
                    {insightContent}
                  </p>
                )}
              </div>

              <div className="mt-8 pt-6 border-t border-black/5 flex justify-end">
                <button 
                  onClick={() => setInsightArea(null)}
                  className="px-8 py-3 bg-black text-white rounded-2xl font-bold hover:bg-gray-800 transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Chatbot */}
      <div className="fixed bottom-6 right-6 z-40">
        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="absolute bottom-20 right-0 w-[calc(100vw-48px)] sm:w-[400px] h-[500px] max-h-[70vh] bg-white rounded-3xl shadow-2xl border border-black/5 flex flex-col overflow-hidden"
            >
              {/* Chat Header */}
              <div className="bg-black p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-yellow-400 rounded-lg flex items-center justify-center">
                    <Zap className="w-5 h-5 text-black fill-black" />
                  </div>
                  <span className="text-white font-bold">Grid Assistant</span>
                </div>
                <button onClick={() => setIsChatOpen(false)} className="text-white/60 hover:text-white transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                {chatMessages.length === 0 && (
                  <div className="text-center py-8">
                    <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">{t('gridAssistantDesc')}</p>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={cn(
                    "flex flex-col max-w-[85%]",
                    msg.role === 'user' ? "ml-auto items-end" : "items-start"
                  )}>
                    <div className={cn(
                      "p-3 rounded-2xl text-sm leading-relaxed",
                      msg.role === 'user' 
                        ? "bg-black text-white rounded-tr-none" 
                        : "bg-white border border-black/5 text-gray-800 rounded-tl-none shadow-sm"
                    )}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex items-start gap-2">
                    <div className="bg-white border border-black/5 p-3 rounded-2xl rounded-tl-none shadow-sm">
                      <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <div className="p-4 bg-white border-t border-black/5">
                <div className="relative">
                  <input 
                    type="text"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder={t('askAboutGrid')}
                    className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-black/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-yellow-400 transition-all"
                  />
                  <button 
                    onClick={sendMessage}
                    disabled={!userInput.trim() || isTyping}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black text-white rounded-xl disabled:opacity-50 transition-all"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsChatOpen(!isChatOpen)}
          className="w-14 h-14 bg-black text-white rounded-2xl shadow-xl flex items-center justify-center hover:bg-gray-800 transition-all border-2 border-yellow-400/20"
        >
          {isChatOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
        </motion.button>
      </div>

      {/* Footer */}
      <footer className="mt-12 border-t border-black/5 p-8 text-center text-gray-400 text-sm font-medium">
        © 2026 ElectroMomentum Grid Management System. All rights reserved.
      </footer>
    </div>
  );
}
