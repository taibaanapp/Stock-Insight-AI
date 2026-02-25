import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  TrendingUp, 
  TrendingDown, 
  ChevronRight, 
  History, 
  Plus, 
  Loader2, 
  Trash2,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  Moon,
  Sun,
  Target,
  Percent,
  Download,
  Database,
  Settings,
  Key,
  HelpCircle,
  Info,
  ShieldAlert,
  BookOpen,
  Monitor
} from 'lucide-react';
import { analyzeChart, getLatestPrice, performWeeklyAnalysis, performFinalRetrospective } from './services/geminiService';
import { Prediction, WeeklyUpdate } from './types';

export default function App() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [apiUsage, setApiUsage] = useState<number>(0);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(localStorage.getItem('gemini_api_key') || '');
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Form State
  const [ticker, setTicker] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [userPrediction, setUserPrediction] = useState<'up' | 'down'>('up');
  const [userReasoning, setUserReasoning] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedPrediction, setSelectedPrediction] = useState<Prediction | null>(null);
  const [retrospectiveLoading, setRetrospectiveLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    fetchPredictions();
    fetchUsage();
  }, []);

  const fetchUsage = async () => {
    try {
      const res = await fetch('/api/usage');
      const data = await res.json();
      setApiUsage(data.count);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  const fetchPredictions = async () => {
    const res = await fetch('/api/predictions');
    const data = await res.json();
    // Ensure uniqueness by ID just in case
    const uniqueData = Array.from(new Map(data.map((p: Prediction) => [p.id, p])).values());
    setPredictions(uniqueData as Prediction[]);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!ticker || !selectedImage || !userReasoning) return;
    if (!checkApiKey()) return;
    
    setIsUploading(true);
    try {
      const geminiAnalysis = await analyzeChart(selectedImage, ticker, userPrediction, userReasoning);
      const initialPrice = geminiAnalysis.initialPrice || await getLatestPrice(ticker);

      const newPrediction: Prediction = {
        id: crypto.randomUUID(),
        ticker: ticker.toUpperCase(),
        chart_image: selectedImage,
        user_prediction: userPrediction,
        user_reasoning: userReasoning,
        target_price: targetPrice ? parseFloat(targetPrice) : undefined,
        gemini_prediction: geminiAnalysis.prediction,
        gemini_reasoning: geminiAnalysis.reasoning,
        gemini_alignment_score: geminiAnalysis.alignmentScore,
        gemini_alignment_reason: geminiAnalysis.alignmentReason,
        initial_price: initialPrice,
        created_at: new Date().toISOString(),
        status: 'active',
        weekly_data: []
      };

      await fetch('/api/predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPrediction)
      });

      setPredictions([newPrediction, ...predictions]);
      setShowNewForm(false);
      resetForm();
      fetchUsage();
    } catch (error) {
      console.error(error);
      alert("Failed to analyze chart. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const resetForm = () => {
    setTicker('');
    setTargetPrice('');
    setUserReasoning('');
    setSelectedImage(null);
  };

  const handleSaveSettings = () => {
    localStorage.setItem('gemini_api_key', apiKeyInput);
    setShowSettings(false);
    alert("Settings saved!");
  };

  const checkApiKey = () => {
    const key = localStorage.getItem('gemini_api_key') || process.env.GEMINI_API_KEY;
    if (!key) {
      setShowSettings(true);
      alert("กรุณาตั้งค่า Gemini API Key ก่อนใช้งาน");
      return false;
    }
    return true;
  };

  const handleWeeklyUpdate = async (prediction: Prediction) => {
    if (!checkApiKey()) return;
    setLoadingAction(prediction.id);
    try {
      const currentPrice = await getLatestPrice(prediction.ticker);
      const nextWeek = prediction.weekly_data.length + 1;
      
      const result = await performWeeklyAnalysis(
        prediction.ticker,
        prediction.initial_price,
        currentPrice,
        prediction.user_prediction,
        prediction.user_reasoning,
        prediction.gemini_prediction,
        prediction.gemini_reasoning,
        nextWeek,
        prediction.target_price
      );

      const newUpdate: WeeklyUpdate = {
        week: nextWeek,
        price: currentPrice,
        date: new Date().toISOString(),
        analysis: result.analysis || '',
        alignment_score: result.alignmentScore,
        alignment_reason: result.alignmentReason
      };

      const updatedWeeklyData = [...prediction.weekly_data, newUpdate];
      const isFinished = nextWeek >= 4;

      await fetch(`/api/predictions/${prediction.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekly_data: updatedWeeklyData,
          status: isFinished ? 'completed' : 'active'
        })
      });

      fetchPredictions();
      fetchUsage();
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/predictions/${deleteId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchPredictions();
        setDeleteId(null);
      }
    } catch (error) {
      console.error("Delete error:", error);
    }
  };

  const handleViewRetrospective = async (prediction: Prediction) => {
    setSelectedPrediction(prediction);
    if (!prediction.final_retrospective && prediction.status === 'completed') {
      if (!checkApiKey()) return;
      setRetrospectiveLoading(true);
      try {
        const retro = await performFinalRetrospective(
          prediction.ticker,
          prediction.user_reasoning,
          prediction.weekly_data
        );
        
        await fetch(`/api/predictions/${prediction.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ final_retrospective: retro })
        });
        
        setPredictions(prev => prev.map(p => p.id === prediction.id ? { ...p, final_retrospective: retro } : p));
        fetchUsage();
      } catch (error) {
        console.error(error);
      } finally {
        setRetrospectiveLoading(false);
      }
    }
  };

  const handleBackup = async () => {
    try {
      const res = await fetch('/api/backup');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stock-insight-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Backup failed");
    }
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm("การกู้คืนข้อมูลจะเขียนทับข้อมูลปัจจุบันทั้งหมด คุณแน่ใจหรือไม่?")) return;

    setIsRestoring(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (res.ok) {
        alert("กู้คืนข้อมูลสำเร็จ!");
        fetchPredictions();
        fetchUsage();
      } else {
        throw new Error("Restore failed");
      }
    } catch (e) {
      console.error(e);
      alert("การกู้คืนข้อมูลล้มเหลว ตรวจสอบรูปแบบไฟล์ของคุณ");
    } finally {
      setIsRestoring(false);
      e.target.value = '';
    }
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'bg-black text-white' : 'bg-[#F9F9F9] text-gray-900'}`}>
      <div className="max-w-7xl mx-auto p-4 md:p-10">
        {/* Header */}
        <header className="flex justify-between items-center mb-12">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-4xl font-black tracking-tighter uppercase">Stock Insight AI</h1>
              <span className="bg-indigo-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-md mt-1">v0.1</span>
            </div>
            <p className={`text-xs font-mono uppercase tracking-widest mt-1 opacity-50`}>Standalone AI Prediction Tracker</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 mr-2">
              <button 
                onClick={() => setShowHelp(true)}
                title="Help & Terms"
                className={`p-2.5 rounded-xl transition-all ${darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-400' : 'bg-white shadow-sm border border-black/5 text-gray-500 hover:bg-gray-50'}`}
              >
                <HelpCircle size={18} />
              </button>
              <button 
                onClick={() => setShowSettings(true)}
                title="Settings"
                className={`p-2.5 rounded-xl transition-all ${darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-400' : 'bg-white shadow-sm border border-black/5 text-gray-500 hover:bg-gray-50'}`}
              >
                <Settings size={18} />
              </button>
              <button 
                onClick={handleBackup}
                title="Backup Data"
                className={`p-2.5 rounded-xl transition-all ${darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-400' : 'bg-white shadow-sm border border-black/5 text-gray-500 hover:bg-gray-50'}`}
              >
                <Download size={18} />
              </button>
              <label 
                title="Restore Data"
                className={`p-2.5 rounded-xl transition-all cursor-pointer ${darkMode ? 'bg-gray-800 hover:bg-gray-700 text-gray-400' : 'bg-white shadow-sm border border-black/5 text-gray-500 hover:bg-gray-50'}`}
              >
                <input type="file" accept=".json" onChange={handleRestore} className="hidden" />
                {isRestoring ? <Loader2 size={18} className="animate-spin" /> : <Database size={18} />}
              </label>
            </div>
            <div className={`px-4 py-2 rounded-2xl border flex items-center gap-3 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-black/5 shadow-sm'}`}>
              <div className="flex flex-col">
                <span className="text-[9px] font-bold uppercase opacity-40 tracking-widest">Gemini Quota</span>
                <span className="text-xs font-black font-mono">
                  {Math.max(0, 1500 - apiUsage)} / 1500 <span className="opacity-30 text-[10px]">left</span>
                </span>
              </div>
              <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                <Percent size={14} />
              </div>
            </div>
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className={`p-3 rounded-full transition-all ${darkMode ? 'bg-gray-800 text-yellow-400' : 'bg-white shadow-sm text-gray-600'}`}
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button 
              onClick={() => setShowNewForm(true)}
              className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
            >
              <Plus size={20} />
              <span className="hidden sm:inline">เพิ่มการทำนาย</span>
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="space-y-16">
          {/* Active Predictions */}
          <section>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] opacity-50">กำลังติดตาม (Active)</h2>
            </div>

            <div className={`rounded-3xl shadow-sm border overflow-hidden ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-black/5'}`}>
              <div className={`grid grid-cols-6 p-5 text-[10px] font-bold uppercase tracking-widest opacity-40 border-b ${darkMode ? 'border-gray-800 bg-gray-800/30' : 'border-black/5 bg-gray-50'}`}>
                <div className="col-span-1">Ticker</div>
                <div className="col-span-1">คำทำนาย</div>
                <div className="col-span-1">เป้าหมาย</div>
                <div className="col-span-1">AI Alignment</div>
                <div className="col-span-1">ความคืบหน้า</div>
                <div className="col-span-1 text-right">จัดการ</div>
              </div>

              <AnimatePresence mode="popLayout">
                {predictions.filter(p => p.status === 'active').map((p) => (
                  <motion.div 
                    key={`active-${p.id}`}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`grid grid-cols-6 p-6 items-center border-b last:border-0 transition-colors cursor-pointer ${darkMode ? 'border-gray-800 hover:bg-gray-800/50' : 'border-black/5 hover:bg-gray-50'}`}
                    onClick={() => handleViewRetrospective(p)}
                  >
                    <div className="font-black text-xl tracking-tighter">
                      {p.ticker}
                      <div className="text-[9px] font-mono font-bold opacity-30 uppercase tracking-tighter mt-0.5">
                        {new Date(p.created_at).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' })}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${p.user_prediction === 'up' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                        {p.user_prediction === 'up' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                      </div>
                      <span className="text-xs font-bold uppercase">{p.user_prediction === 'up' ? 'UP' : 'DOWN'}</span>
                    </div>
                    <div className="font-mono text-sm font-bold opacity-60">
                      {p.target_price ? `$${p.target_price.toFixed(2)}` : '-'}
                    </div>
                    <div>
                      {p.gemini_alignment_score !== undefined ? (
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-indigo-500" 
                              style={{ width: `${p.gemini_alignment_score}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-bold font-mono">{p.gemini_alignment_score}%</span>
                        </div>
                      ) : '-'}
                    </div>
                    <div>
                      <div className="flex gap-1 mb-1">
                        {[1, 2, 3, 4].map((w) => (
                          <div 
                            key={`dot-${p.id}-${w}`} 
                            className={`h-1 w-4 rounded-full ${w <= p.weekly_data.length ? 'bg-indigo-500' : (darkMode ? 'bg-gray-700' : 'bg-gray-200')}`}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] font-bold opacity-40">Week {p.weekly_data.length}/4</span>
                    </div>
                    <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      <button 
                        disabled={loadingAction === p.id}
                        onClick={() => handleWeeklyUpdate(p)}
                        className={`p-2 rounded-xl transition-all ${darkMode ? 'bg-gray-800 hover:bg-indigo-600' : 'bg-gray-100 hover:bg-black hover:text-white'}`}
                      >
                        {loadingAction === p.id ? <Loader2 className="animate-spin" size={16} /> : <ChevronRight size={16} />}
                      </button>
                      <button 
                        onClick={() => setDeleteId(p.id)}
                        className={`p-2 rounded-xl transition-all ${darkMode ? 'bg-gray-800 hover:bg-rose-600' : 'bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white'}`}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </motion.div>
                ))}
                {predictions.filter(p => p.status === 'active').length === 0 && (
                  <motion.div 
                    key="no-active-predictions"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="p-20 text-center opacity-20 italic text-sm"
                  >
                    ยังไม่มีรายการที่กำลังติดตาม
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </section>

          {/* History */}
          <section>
            <div className="flex items-center gap-3 mb-6">
              <History size={16} className="opacity-50" />
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] opacity-50">ประวัติการวิเคราะห์ (History)</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {predictions.filter(p => p.status === 'completed').map((p) => (
                <motion.div 
                  key={`completed-${p.id}`}
                  whileHover={{ y: -5 }}
                  className={`p-8 rounded-[2rem] border transition-all cursor-pointer group relative ${darkMode ? 'bg-gray-900 border-gray-800 hover:border-indigo-500/50' : 'bg-white border-black/5 hover:shadow-xl'}`}
                  onClick={() => handleViewRetrospective(p)}
                >
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-2xl font-black tracking-tighter">{p.ticker}</h3>
                      <p className="text-[10px] font-mono font-bold opacity-30 mt-1">{new Date(p.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest">Completed</div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className={`p-4 rounded-2xl ${darkMode ? 'bg-gray-800/50' : 'bg-gray-50'}`}>
                      <h4 className="text-[9px] font-bold uppercase opacity-30 mb-2 tracking-widest">สรุปผลสุดท้าย</h4>
                      <p className="text-sm leading-relaxed opacity-70 line-clamp-2">
                        {p.weekly_data[p.weekly_data.length - 1]?.analysis || "เสร็จสิ้นการติดตาม"}
                      </p>
                    </div>
                    <div className="flex justify-between items-center pt-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${p.user_prediction === 'up' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        <span className="text-[10px] font-bold uppercase opacity-50">{p.user_prediction}</span>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setDeleteId(p.id); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        </main>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {/* New Prediction Form */}
        {showNewForm && (
          <div key="modal-new-form" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              className={`w-full max-w-3xl rounded-[2.5rem] shadow-2xl overflow-hidden border ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-black/5'}`}
            >
              <div className={`p-8 border-b flex justify-between items-center ${darkMode ? 'bg-gray-800/50 border-gray-800' : 'bg-gray-50/50 border-black/5'}`}>
                <h2 className="text-3xl font-black tracking-tighter">เพิ่มการทำนายใหม่</h2>
                <button 
                  onClick={() => setShowNewForm(false)} 
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}
                >
                  <Plus className="rotate-45" size={24} />
                </button>
              </div>

              <div className="p-10 space-y-8 max-h-[75vh] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase opacity-30 tracking-widest ml-1">Ticker</label>
                    <input 
                      type="text" 
                      value={ticker}
                      onChange={(e) => setTicker(e.target.value)}
                      placeholder="เช่น PTT, AAPL"
                      className={`w-full p-5 rounded-2xl font-black text-2xl focus:outline-none transition-all ${darkMode ? 'bg-gray-800 focus:ring-2 ring-indigo-500/50' : 'bg-gray-50 focus:ring-2 ring-black/5'}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase opacity-30 tracking-widest ml-1">Target Price</label>
                    <div className="relative">
                      <Target className="absolute left-5 top-1/2 -translate-y-1/2 opacity-20" size={20} />
                      <input 
                        type="number" 
                        value={targetPrice}
                        onChange={(e) => setTargetPrice(e.target.value)}
                        placeholder="0.00"
                        className={`w-full p-5 pl-14 rounded-2xl font-black text-2xl focus:outline-none transition-all ${darkMode ? 'bg-gray-800 focus:ring-2 ring-indigo-500/50' : 'bg-gray-50 focus:ring-2 ring-black/5'}`}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase opacity-30 tracking-widest ml-1">ทิศทางราคา</label>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setUserPrediction('up')}
                      className={`flex-1 flex items-center justify-center gap-3 py-5 rounded-2xl border-2 transition-all font-bold ${userPrediction === 'up' ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-500/20' : (darkMode ? 'bg-gray-800 border-transparent opacity-40' : 'bg-gray-50 border-transparent opacity-40')}`}
                    >
                      <TrendingUp size={24} />
                      <span className="uppercase">UP</span>
                    </button>
                    <button 
                      onClick={() => setUserPrediction('down')}
                      className={`flex-1 flex items-center justify-center gap-3 py-5 rounded-2xl border-2 transition-all font-bold ${userPrediction === 'down' ? 'bg-rose-600 border-rose-600 text-white shadow-lg shadow-rose-500/20' : (darkMode ? 'bg-gray-800 border-transparent opacity-40' : 'bg-gray-50 border-transparent opacity-40')}`}
                    >
                      <TrendingDown size={24} />
                      <span className="uppercase">DOWN</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase opacity-30 tracking-widest ml-1">อัปโหลดกราฟ</label>
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="modal-upload" />
                  <label 
                    htmlFor="modal-upload"
                    className={`w-full h-48 border-2 border-dashed rounded-[2rem] flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden ${selectedImage ? 'border-solid p-0' : 'p-10'} ${darkMode ? 'border-gray-700 hover:border-indigo-500' : 'border-black/10 hover:border-black'}`}
                  >
                    {selectedImage ? (
                      <img src={selectedImage} className="w-full h-full object-cover" />
                    ) : (
                      <>
                        <Upload className="opacity-20 mb-2" size={32} />
                        <span className="text-[10px] font-bold uppercase opacity-30 tracking-widest">Click to upload chart</span>
                      </>
                    )}
                  </label>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-bold uppercase opacity-30 tracking-widest ml-1">เหตุผลทางเทคนิค</label>
                  <textarea 
                    value={userReasoning}
                    onChange={(e) => setUserReasoning(e.target.value)}
                    placeholder="ระบุตรรกะของคุณ เช่น RSI Overbought, แนวรับสำคัญ..."
                    className={`w-full p-6 rounded-[2rem] min-h-[150px] focus:outline-none transition-all text-lg ${darkMode ? 'bg-gray-800 focus:ring-2 ring-indigo-500/50' : 'bg-gray-50 focus:ring-2 ring-black/5'}`}
                  />
                </div>

                <button 
                  onClick={handleSubmit}
                  disabled={isUploading || !ticker || !selectedImage || !userReasoning}
                  className={`w-full py-6 rounded-[2rem] font-black text-xl uppercase tracking-widest transition-all shadow-xl disabled:opacity-50 ${darkMode ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20' : 'bg-black text-white hover:bg-gray-800 shadow-black/10'}`}
                >
                  {isUploading ? <Loader2 className="animate-spin mx-auto" size={24} /> : "เริ่มบันทึกการทำนาย"}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Help & Terms Modal */}
        {showHelp && (
          <div key="modal-help" className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHelp(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={`relative w-full max-w-2xl rounded-[2.5rem] p-10 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] ${darkMode ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}
            >
                <div className="flex justify-between items-start mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                      <HelpCircle size={24} />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black tracking-tight">คู่มือและข้อตกลง</h2>
                      <p className="text-xs font-bold opacity-40 uppercase tracking-widest">User Guide & Terms of Use</p>
                    </div>
                  </div>
                  <button onClick={() => setShowHelp(false)} className="p-2 opacity-40 hover:opacity-100 transition-opacity">
                    <Plus className="rotate-45" size={24} />
                  </button>
                </div>

                <div className="overflow-y-auto pr-4 custom-scrollbar space-y-10">
                  {/* Terms of Use */}
                  <section className="space-y-4">
                    <div className="flex items-center gap-2 text-rose-500">
                      <ShieldAlert size={18} />
                      <h3 className="font-bold text-sm uppercase tracking-wider">ข้อตกลงการใช้งาน (Terms of Use)</h3>
                    </div>
                    <div className={`p-6 rounded-2xl text-xs leading-relaxed space-y-3 ${darkMode ? 'bg-gray-800/50' : 'bg-gray-50'}`}>
                      <p>1. <strong>ไม่ใช่คำแนะนำทางการเงิน:</strong> แอปพลิเคชันนี้เป็นเพียงเครื่องมือช่วยวิเคราะห์ข้อมูลทางเทคนิคด้วย AI เท่านั้น ผลลัพธ์ที่ได้ไม่ใช่คำชี้ชวนหรือคำแนะนำในการลงทุน</p>
                      <p>2. <strong>ความเสี่ยง:</strong> การลงทุนในตลาดหุ้นมีความเสี่ยงสูง ผู้ใช้ต้องเป็นผู้รับผิดชอบต่อการตัดสินใจลงทุนและผลกำไร/ขาดทุนที่เกิดขึ้นด้วยตนเอง</p>
                      <p>3. <strong>ความเป็นส่วนตัว:</strong> ข้อมูลทั้งหมดถูกบันทึกไว้ในฐานข้อมูลของระบบ และจะถูกส่งไปยัง Google Gemini API เฉพาะเมื่อมีการเรียกใช้งานวิเคราะห์เท่านั้น</p>
                      <p>4. <strong>ความถูกต้อง:</strong> AI อาจให้ข้อมูลที่ผิดพลาดได้ ผู้ใช้ควรตรวจสอบข้อมูลจากแหล่งอื่นประกอบเสมอ</p>
                    </div>
                  </section>

                  {/* User Manual */}
                  <section className="space-y-4 pb-6">
                    <div className="flex items-center gap-2 text-indigo-500">
                      <BookOpen size={18} />
                      <h3 className="font-bold text-sm uppercase tracking-wider">วิธีใช้งานแอป (User Manual)</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className={`p-5 rounded-2xl border ${darkMode ? 'border-gray-800' : 'border-black/5'}`}>
                        <div className="font-bold text-xs mb-2">1. ตั้งค่า API Key</div>
                        <p className="text-[11px] opacity-60">ไปที่ Settings (ไอคอนฟันเฟือง) แล้วใส่ Gemini API Key จาก Google AI Studio เพื่อเริ่มใช้งานโควต้าฟรี</p>
                      </div>
                      <div className={`p-5 rounded-2xl border ${darkMode ? 'border-gray-800' : 'border-black/5'}`}>
                        <div className="font-bold text-xs mb-2">2. บันทึกการทำนาย</div>
                        <p className="text-[11px] opacity-60">กดปุ่ม "เพิ่มการทำนาย" อัปโหลดภาพกราฟ ใส่ชื่อหุ้น และเหตุผลของคุณเพื่อให้ AI ช่วยวิเคราะห์</p>
                      </div>
                      <div className={`p-5 rounded-2xl border ${darkMode ? 'border-gray-800' : 'border-black/5'}`}>
                        <div className="font-bold text-xs mb-2">3. ติดตามผล</div>
                        <p className="text-[11px] opacity-60">ระบบจะให้คุณอัปเดตราคาหุ้นทุกสัปดาห์ เพื่อเปรียบเทียบความแม่นยำระหว่างคุณและ AI</p>
                      </div>
                      <div className={`p-5 rounded-2xl border ${darkMode ? 'border-gray-800' : 'border-black/5'}`}>
                        <div className="font-bold text-xs mb-2">4. สำรองข้อมูล</div>
                        <p className="text-[11px] opacity-60">ใช้ปุ่ม Download เพื่อสำรองข้อมูลลงเครื่อง และปุ่ม Database เพื่อกู้คืนข้อมูลหากมีการย้ายเครื่อง</p>
                      </div>
                    </div>
                  </section>
                </div>
              </motion.div>
            </div>
          )}

        {/* Settings Modal */}
        {showSettings && (
          <div key="modal-settings" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={`relative w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl overflow-hidden ${darkMode ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'}`}
            >
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                    <Settings size={24} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-black tracking-tight">Settings</h2>
                    <p className="text-xs font-bold opacity-40 uppercase tracking-widest">v0.1 Configuration</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-widest opacity-40 mb-3 ml-1">Gemini API Key</label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-500">
                        <Key size={18} />
                      </div>
                      <input 
                        type="password"
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        placeholder="Paste your API key here..."
                        className={`w-full pl-12 pr-4 py-4 rounded-2xl border transition-all focus:ring-2 focus:ring-indigo-500 outline-none ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-black/5'}`}
                      />
                    </div>
                    <p className="text-[10px] mt-3 opacity-50 leading-relaxed">
                      Your API key is stored locally in your browser. You can get a free key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-indigo-500 underline">Google AI Studio</a>.
                    </p>
                  </div>

                  <div className="pt-4">
                    <button 
                      onClick={handleSaveSettings}
                      className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/20"
                    >
                      Save Configuration
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}

        {/* Details Modal */}
        {selectedPrediction && (
          <div key="modal-details" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`w-full max-w-5xl max-h-[90vh] rounded-[3rem] shadow-2xl overflow-hidden flex flex-col border ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-black/5'}`}
            >
              <div className={`p-8 border-b flex justify-between items-center ${darkMode ? 'bg-gray-800/50 border-gray-800' : 'bg-gray-50/50 border-black/5'}`}>
                <div className="flex items-center gap-4">
                  <h2 className="text-4xl font-black tracking-tighter">{selectedPrediction.ticker}</h2>
                  <div className={`px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${selectedPrediction.status === 'active' ? 'bg-indigo-500/10 text-indigo-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                    {selectedPrediction.status}
                  </div>
                </div>
                <button onClick={() => setSelectedPrediction(null)} className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>
                  <Plus className="rotate-45" size={28} />
                </button>
              </div>

              <div className="p-10 overflow-y-auto space-y-16 custom-scrollbar">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                  <div className="space-y-6">
                    <h4 className="text-[10px] font-bold uppercase opacity-30 tracking-widest border-b pb-2">Technical Chart</h4>
                    <div 
                      className="relative group cursor-zoom-in overflow-hidden rounded-[2.5rem] border border-black/5 shadow-inner bg-gray-50"
                      onClick={() => setPreviewImage(selectedPrediction.chart_image)}
                    >
                      <img src={selectedPrediction.chart_image} className="w-full h-80 object-cover group-hover:scale-110 transition-transform duration-700" />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="bg-white text-black px-6 py-2 rounded-full text-xs font-bold shadow-2xl">View Full Image</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-10">
                    <div className="grid grid-cols-2 gap-6">
                      <div className={`p-6 rounded-[2rem] ${darkMode ? 'bg-gray-800/50' : 'bg-gray-50'}`}>
                        <h4 className="text-[9px] font-bold uppercase opacity-30 mb-2 tracking-widest">Initial Price</h4>
                        <p className="text-2xl font-black font-mono">${selectedPrediction.initial_price.toFixed(2)}</p>
                      </div>
                      <div className={`p-6 rounded-[2rem] ${darkMode ? 'bg-gray-800/50' : 'bg-gray-50'}`}>
                        <h4 className="text-[9px] font-bold uppercase opacity-30 mb-2 tracking-widest">Target Price</h4>
                        <p className="text-2xl font-black font-mono text-indigo-500">
                          {selectedPrediction.target_price ? `$${selectedPrediction.target_price.toFixed(2)}` : 'N/A'}
                        </p>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-[9px] font-bold uppercase opacity-30 mb-4 tracking-widest">User Logic</h4>
                      <div className="flex items-center gap-3 mb-4">
                        <div className={`p-2 rounded-xl ${selectedPrediction.user_prediction === 'up' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                          {selectedPrediction.user_prediction === 'up' ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                        </div>
                        <span className="font-black text-xl uppercase">{selectedPrediction.user_prediction}</span>
                      </div>
                      <p className="text-lg leading-relaxed opacity-70 italic">"{selectedPrediction.user_reasoning}"</p>
                    </div>

                    <div className={`p-8 rounded-[2.5rem] border ${darkMode ? 'bg-indigo-500/5 border-indigo-500/20' : 'bg-indigo-50 border-indigo-100'}`}>
                      <div className="flex justify-between items-center mb-4">
                        <h4 className="text-[9px] font-bold uppercase text-indigo-500 tracking-widest">Gemini AI Analysis</h4>
                        {selectedPrediction.gemini_alignment_score !== undefined && (
                          <div className="flex items-center gap-2 bg-indigo-500 text-white px-3 py-1 rounded-full text-[9px] font-bold">
                            <Percent size={10} />
                            {selectedPrediction.gemini_alignment_score}% Alignment
                          </div>
                        )}
                      </div>
                      <p className="text-base leading-relaxed opacity-80 mb-4">{selectedPrediction.gemini_reasoning}</p>
                      {selectedPrediction.gemini_alignment_score !== undefined && (
                        <div className={`p-4 rounded-2xl text-[11px] italic opacity-60 ${darkMode ? 'bg-gray-800' : 'bg-white/50'}`}>
                          AI Insight: {selectedPrediction.gemini_alignment_reason || `Gemini ให้คะแนนความเห็นพ้อง ${selectedPrediction.gemini_alignment_score}% เนื่องจากตรรกะเบื้องต้นของคุณมีความสอดคล้องกับแนวโน้มทางเทคนิคที่ AI ตรวจพบ`}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Timeline */}
                <div className="space-y-8">
                  <h4 className="text-[10px] font-bold uppercase opacity-30 tracking-widest border-b pb-2">Weekly Progress</h4>
                  <div className="space-y-6">
                    {selectedPrediction.weekly_data.length === 0 && (
                      <div className="py-20 text-center opacity-20 italic">No weekly updates yet.</div>
                    )}
                    {selectedPrediction.weekly_data.map((w, i) => (
                      <div key={`${selectedPrediction.id}-update-${i}`} className="flex gap-8 group">
                        <div className="w-20 text-center pt-4">
                          <div className="text-[9px] font-bold opacity-30 uppercase">Week</div>
                          <div className="text-4xl font-black">{w.week}</div>
                        </div>
                        <div className={`flex-1 p-8 rounded-[2.5rem] border transition-all ${darkMode ? 'bg-gray-800/30 border-gray-800 group-hover:bg-gray-800/50' : 'bg-gray-50 border-black/5 group-hover:bg-white group-hover:shadow-xl'}`}>
                          <div className="flex justify-between items-center mb-6">
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-4">
                                <span className="text-2xl font-black font-mono text-indigo-500">${w.price.toFixed(2)}</span>
                                {w.alignment_score !== undefined && (
                                  <span className={`text-[10px] font-bold px-3 py-1 rounded-full ${darkMode ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-100 text-indigo-600'}`}>
                                    {w.alignment_score}% AI Alignment
                                  </span>
                                )}
                              </div>
                              {w.alignment_reason && (
                                <span className="text-[10px] font-medium opacity-50 italic">
                                  AI Logic: {w.alignment_reason}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-bold opacity-30 uppercase tracking-widest">{new Date(w.date).toLocaleDateString()}</span>
                          </div>
                          <p className="text-lg leading-relaxed opacity-70">{w.analysis}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Retrospective */}
                {selectedPrediction.status === 'completed' && (
                  <div className={`p-12 rounded-[3rem] shadow-2xl ${darkMode ? 'bg-white text-black' : 'bg-black text-white'}`}>
                    <div className="flex items-center gap-3 mb-8">
                      <CheckCircle2 className={darkMode ? 'text-indigo-600' : 'text-emerald-400'} size={28} />
                      <h4 className="text-[10px] font-bold uppercase tracking-[0.4em]">Final Retrospective</h4>
                    </div>
                    {retrospectiveLoading ? (
                      <div className="py-12 text-center flex flex-col items-center gap-4">
                        <Loader2 className="animate-spin" size={32} />
                        <span className="text-[10px] font-bold uppercase tracking-widest animate-pulse">Analyzing results...</span>
                      </div>
                    ) : (
                      <div className="prose prose-invert max-w-none">
                        <p className="text-xl leading-relaxed whitespace-pre-wrap font-medium">
                          {selectedPrediction.final_retrospective}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {/* Delete Modal */}
        {deleteId && (
          <div key="modal-delete" className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={`w-full max-w-md rounded-[2.5rem] p-10 text-center shadow-2xl ${darkMode ? 'bg-gray-900' : 'bg-white'}`}
            >
              <div className="w-20 h-20 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle size={40} />
              </div>
              <h2 className="text-2xl font-bold mb-3">Delete Prediction?</h2>
              <p className="opacity-50 mb-8">This action cannot be undone. All tracking data will be lost.</p>
              <div className="flex gap-4">
                <button onClick={() => setDeleteId(null)} className={`flex-1 py-4 rounded-2xl font-bold ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>Cancel</button>
                <button onClick={handleDelete} className="flex-1 py-4 bg-rose-600 text-white rounded-2xl font-bold shadow-lg shadow-rose-500/20">Delete</button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Image Preview */}
        {previewImage && (
          <div key="modal-preview" className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/95 backdrop-blur-2xl cursor-zoom-out" onClick={() => setPreviewImage(null)}>
            <motion.img 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              src={previewImage} 
              className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl border border-white/10" 
            />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
