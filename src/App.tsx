/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, ChangeEvent, ReactNode, FormEvent, useEffect } from "react";
import { 
  FileSearch, 
  Upload, 
  CheckCircle2, 
  Loader2, 
  ChevronRight, 
  Copy, 
  Download, 
  ArrowLeft,
  FileText,
  User,
  MapPin,
  Car,
  Clock,
  ExternalLink,
  ShieldAlert,
  LogOut,
  LayoutDashboard,
  LayoutGrid,
  Filter,
  Wrench,
  Building,
  Pencil,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calendar as CalendarIcon,
  Info,
  ChevronLeft,
  Bell
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { type ExtractionResult } from "./lib/gemini.ts";
import { 
  auth, 
  loginWithGoogle, 
  logout, 
  getAdminRole, 
  syncUserAdminRole,
  saveGenericRequest, 
  assignVehicle,
  assignFleetManually,
  db,
  updateRequestStatus
} from "./lib/firebase.ts";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { collection, onSnapshot, query, orderBy, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { FLEET, MEETING_ROOMS, CATERING_MENU, COMPLAINT_CATEGORIES, STATIONERY_ITEMS, KAEDAH_HIDANGAN } from "./constants";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay, 
  addMonths, 
  subMonths,
  parseISO,
  isValid
} from "date-fns";

function LiveDateTime() {
  const [date, setDate] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setDate(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formaterTime = new Intl.DateTimeFormat('ms-MY', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
  }).format(date);

  const formaterDate = new Intl.DateTimeFormat('ms-MY', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  }).format(date);

  return (
    <div className="hidden md:flex flex-col items-end justify-center mr-6 border-r border-dark-surface pr-6">
      <div className="text-[13px] font-mono font-bold text-cyan-bright tracking-wider">{formaterTime}</div>
      <div className="text-[9px] text-text-light/50 uppercase tracking-widest">{formaterDate}</div>
    </div>
  );
}

type AppState = "idle" | "processing" | "result" | "error" | "filling" | "admin" | "calendar" | "hub";
type AppModule = "vehicle" | "meeting" | "catering" | "complaint" | "stationery";

export default function App() {
  const [state, setState] = useState<AppState>("idle");
  const [currentModule, setCurrentModule] = useState<AppModule>("vehicle");
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [isDriver, setIsDriver] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const role = await syncUserAdminRole(u);
        setAdminRole(role);
        
        // Check if user is a driver
        const driverExists = FLEET.find(v => v.driver.toLowerCase() === u.email?.toLowerCase());
        setIsDriver(!!driverExists);
      } else {
        setAdminRole(null);
        setIsDriver(false);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    // Fetch all requests for calendar and admin only if user is logged in
    if (!user) {
      setRequests([]);
      return;
    }
    
    const q = query(collection(db, "requests"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.error("Firestore onSnapshot error:", err);
    });
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    // Keep selectedRequest in sync with requests list
    if (selectedRequest) {
      const updated = requests.find(r => r.id === selectedRequest.id);
      if (updated) {
        setSelectedRequest(updated);
      }
    }
  }, [requests]);

  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const initialFormData: ExtractionResult = {
    maklumat_pemohon: {
      nama: "",
      email: "",
      jawatan: "",
      tempat_bertugas: "",
      no_tel_pejabat: "",
      no_tel_bimbit: ""
    },
    butiran_perjalanan: {
      tujuan: "",
      tarikh_perlukan: "",
      waktu_bertolak: "",
      tempat_menunggu: "",
      penumpang: [""]
    },
    jenis_kenderaan_dipohon: {
      jenis: "",
      kenderaan_id: "",
      tujuan_penggunaan: ""
    },
    status_kelulusan: {
      ketua_unit: "MENUNGGU SOKONGAN",
      pegawai_kenderaan: "MENUNGGU PENGESAHAN",
      bahagian_pentadbiran: "MENUNGGU KELULUSAN",
      pemandu: "MENUNGGU JAWAPAN"
    },
    makanan: {
      perlu_makanan: false,
      jenis_makanan: "",
      kaedah_hidangan: ""
    }
  };

  // Form State for "Fill Mode"
  const [formData, setFormData] = useState<ExtractionResult>(initialFormData);


  const handleFormSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    // For stationery, it goes straight to the responsible officer, bypassing Unit Head.
    let finalData = { ...formData };
    if (currentModule === 'stationery') {
      finalData.status_kelulusan = {
        ...finalData.status_kelulusan,
        ketua_unit: "DISOKONG"
      };
    }
    
    setResult(finalData);
    setState("result");
    
    // Auto-save to Firebase if logged in
    if (user) {
      try {
        await saveGenericRequest(user.uid, user.email || "", finalData, currentModule);
      } catch (err) {
        console.error("Failed to save request:", err);
      }
    }
  };

  const addPassenger = () => {
    setFormData(prev => ({
      ...prev,
      butiran_perjalanan: {
        ...prev.butiran_perjalanan,
        penumpang: [...prev.butiran_perjalanan.penumpang, ""]
      }
    }));
  };

  const updatePassenger = (index: number, val: string) => {
    const newPassengers = [...formData.butiran_perjalanan.penumpang];
    newPassengers[index] = val;
    setFormData(prev => ({
      ...prev,
      butiran_perjalanan: {
        ...prev.butiran_perjalanan,
        penumpang: newPassengers
      }
    }));
  };

  const reset = () => {
    setState("idle");
    setResult(null);
    setError(null);
    setSelectedRequest(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="min-h-screen text-text-light font-sans selection:bg-cyan-bright/20 flex flex-col">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#030508]/60 border-b border-cyan-bright/10">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={reset}>
            <div className="w-10 h-10 border border-white/10 rounded-full flex items-center justify-center relative bg-dark-surface/50 overflow-hidden">
              <img src="/logo-risda.png" alt="RISDA Logo" className="w-7 h-7 object-contain animate-[spin_10s_linear_infinite]" />
              {isDriver && <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-dark-bg animate-pulse"></div>}
            </div>
              <div className="flex flex-col -gap-1">
              <span className="font-serif font-bold tracking-tight text-lg text-white leading-tight">RISDA Beaufort e-Portal</span>
              <span className="text-[10px] uppercase tracking-widest text-cyan-bright font-bold">Integrated_Services</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            
            <LiveDateTime />

            <div className="hidden lg:flex items-center gap-6 text-[11px] font-bold uppercase tracking-widest text-text-light/60">
              {isDriver && (
                <button onClick={() => setState("admin")} className="text-yellow-500 hover:bg-yellow-500/10 px-3 py-1 border border-yellow-500/30 rounded-sm flex items-center gap-2">
                  <LayoutDashboard className="w-3 h-3" /> Driver Dashboard
                </button>
              )}
              {adminRole && (
                <button onClick={() => setState("admin")} className="text-cyan-bright hover:bg-cyan-bright/10 px-3 py-1 border border-cyan-bright/30 rounded-sm flex items-center gap-2">
                  <LayoutDashboard className="w-3 h-3" /> Dashboard Admin
                </button>
              )}
            </div>
            
            <div className="flex items-center gap-4 pl-6 border-l border-dark-surface">
              {user ? (
                <div className="flex items-center gap-3">
                  <div className="hidden sm:flex flex-col items-end">
                    <span className="text-[10px] font-bold text-white uppercase tracking-tighter">{user.displayName || user.email}</span>
                    <button onClick={logout} className="text-[8px] uppercase tracking-[0.2em] text-red-400 hover:text-red-500 font-bold transition-colors">Secure_Logout</button>
                  </div>
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="User" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full border border-dark-surface" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-dark-surface flex items-center justify-center border border-dark-surface">
                      <User className="w-4 h-4 text-text-light" />
                    </div>
                  )}
                </div>
              ) : (
                <button 
                  onClick={loginWithGoogle}
                  className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest bg-white text-dark-bg px-4 py-2 rounded-sm hover:bg-cyan-bright transition-all"
                >
                  Sign_In
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-12">
        <AnimatePresence mode="wait">
          {state === "idle" && (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center text-center max-w-5xl mx-auto pt-16 pb-20"
            >
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-cyan-bright/30 backdrop-blur-md bg-dark-surface/40 text-cyan-bright text-[10px] font-bold uppercase tracking-[0.25em] mb-8 shadow-[0_0_15px_rgba(56,189,248,0.15)]">
                RISDA_BEAUFORT_PORTAL_V2
              </div>
              <h1 className="text-6xl md:text-8xl font-light text-white tracking-tighter leading-tight mb-8">
                e-Portal <span className="font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-bright to-cyan-muted">RISDA Beaufort.</span>
              </h1>
              <p className="text-lg md:text-xl text-text-light/80 mb-20 max-w-2xl leading-relaxed font-light">
                Portal Perkhidmatan Bersepadu Pejabat RISDA Daerah Beaufort merangkumi Pengurusan Kenderaan, Tempahan Bilik Mesyuarat, Tempahan Makan/Minum, Permohonan Alat Tulis dan Aduan Kerosakan.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 xl:gap-8 w-full max-w-full relative z-10">
                <ModuleCard 
                  title="Kenderaan"
                  desc="Tempahan kenderaan rasmi."
                  icon={<Car className="w-8 h-8" />}
                  onClick={() => {
                    setCurrentModule("vehicle");
                    setState("hub");
                  }}
                  active={currentModule === "vehicle"}
                />
                <ModuleCard 
                  title="Mesyuarat"
                  desc="Bilik & fasiliti."
                  icon={<MapPin className="w-8 h-8" />}
                  onClick={() => {
                    setCurrentModule("meeting");
                    setState("hub");
                  }}
                  active={currentModule === "meeting"}
                />
                <ModuleCard 
                  title="Katering"
                  desc="Makanan & minuman."
                  icon={<FileText className="w-8 h-8" />}
                  onClick={() => {
                    setCurrentModule("catering");
                    setState("hub");
                  }}
                  active={currentModule === "catering"}
                />
                <ModuleCard 
                  title="Aduan"
                  desc="Kerosakan ICT/Bangunan."
                  icon={<Wrench className="w-8 h-8" />}
                  onClick={() => {
                    setCurrentModule("complaint");
                    setState("hub");
                  }}
                  active={currentModule === "complaint"}
                />
                <ModuleCard 
                  title="Alat Tulis"
                  desc="Permohonan stok pejabat."
                  icon={<Pencil className="w-8 h-8" />}
                  onClick={() => {
                    setCurrentModule("stationery");
                    setState("hub");
                  }}
                  active={currentModule === "stationery"}
                />
              </div>

              {user && (
                <div id="request-history" className="mt-32 w-full max-w-5xl text-left">
                  <div className="flex items-center gap-4 mb-10 border-b border-dark-surface pb-6">
                    <h2 className="text-2xl font-light text-white tracking-widest uppercase italic">Recent_History <span className="font-bold opacity-30 text-cyan-bright">.LOG</span></h2>
                    <div className="h-[1px] flex-grow bg-dark-surface"></div>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-4">
                    {requests
                      .filter(r => r.userId === user.uid)
                      .slice(0, 10)
                      .map((req, idx) => (
                      <motion.div 
                        key={req.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="p-6 bg-dark-surface/10 border border-dark-surface hover:bg-dark-surface/20 hover:border-cyan-bright/30 transition-all rounded-lg flex flex-col md:flex-row justify-between items-center gap-6"
                      >
                        <div className="flex-grow">
                          <div className="flex items-center gap-3 mb-2">
                             <div className="px-2 py-0.5 bg-dark-bg border border-dark-surface rounded text-[8px] font-mono text-cyan-muted uppercase">{req.moduleType || "V"}_{req.id.substring(0,8)}</div>
                             <span className="text-[10px] font-mono text-text-light/30">{req.createdAt ? new Date(req.createdAt.toDate()).toLocaleString() : 'Saving...'}</span>
                          </div>
                          <h4 className="text-white text-sm font-bold uppercase tracking-widest mb-1">{req.data.butiran_perjalanan.tujuan || "N/A"}</h4>
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 text-[10px] text-text-light/50 font-medium">
                              {req.moduleType === 'vehicle' && <Car className="w-3 h-3" />}
                              {req.moduleType === 'meeting' && <MapPin className="w-3 h-3" />}
                              {req.moduleType === 'catering' && <FileText className="w-3 h-3" />}
                              {req.moduleType === 'complaint' && <Wrench className="w-3 h-3" />}
                              {req.moduleType === 'stationery' && <Pencil className="w-3 h-3" />}
                              <span className="text-cyan-bright uppercase">{req.moduleType || 'vehicle'}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-3">
                           <StatusBadge label="Kelulusan" status={req.data.status_kelulusan.bahagian_pentadbiran} />
                        </div>
                      </motion.div>
                    ))}
                    {requests.filter(r => r.userId === user.uid).length === 0 && (
                      <div className="p-12 text-center bg-dark-surface/5 border border-dashed border-dark-surface rounded-xl flex flex-col items-center justify-center opacity-40">
                         <Info className="w-8 h-8 mb-4 text-cyan-muted" />
                         <p className="text-[10px] font-bold uppercase tracking-[0.3em]">No_History_Records_Found</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {state === "hub" && (
            <motion.div
              key="hub"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center text-center max-w-5xl mx-auto pt-16 pb-20"
            >
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-cyan-bright/30 backdrop-blur-md bg-dark-surface/40 text-cyan-bright text-[10px] font-bold uppercase tracking-[0.25em] mb-6 shadow-[0_0_15px_rgba(56,189,248,0.15)]">
                Modul Aktif: {currentModule.toUpperCase()}
              </div>
              <h2 className="text-6xl md:text-7xl font-light text-white tracking-tighter leading-tight mb-16 capitalize">
                Dashboard <span className="font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-bright to-cyan-muted">
                  {currentModule === "complaint" ? "Aduan Kerosakan" : 
                   currentModule === "stationery" ? "Alat Tulis" : 
                   currentModule}.
                </span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-5xl relative z-10">
                <div 
                  onClick={() => setState("filling")}
                  className="group relative overflow-hidden p-10 rounded-2xl transition-all duration-500 text-left cursor-pointer transform hover:-translate-y-2 border border-white/5 bg-dark-bg/40 backdrop-blur-md hover:border-cyan-bright/50 hover:bg-dark-surface/60 hover:shadow-2xl"
                >
                  <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-cyan-bright/5 rounded-full blur-3xl group-hover:bg-cyan-bright/10 transition-all duration-700"></div>
                  <div className="relative z-10 w-16 h-16 rounded-xl border border-white/10 bg-dark-surface flex items-center justify-center mb-6 group-hover:border-cyan-bright/50 group-hover:text-cyan-bright transition-all duration-500 group-hover:rotate-6">
                    <FileText className="w-8 h-8 text-cyan-muted group-hover:text-cyan-bright transition-colors" />
                  </div>
                  <h3 className="relative z-10 text-xl font-black text-white mb-3 tracking-wide">Hantar Permohonan</h3>
                  <p className="relative z-10 text-sm text-text-light/60 font-medium leading-relaxed">Isi borang digital untuk permohonan baru layanan {currentModule}.</p>
                </div>

                <div 
                  onClick={() => setState("calendar")}
                  className="group relative overflow-hidden p-10 rounded-2xl transition-all duration-500 text-left cursor-pointer transform hover:-translate-y-2 border border-white/5 bg-dark-bg/40 backdrop-blur-md hover:border-cyan-bright/50 hover:bg-dark-surface/60 hover:shadow-2xl"
                >
                  <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-cyan-bright/5 rounded-full blur-3xl group-hover:bg-cyan-bright/10 transition-all duration-700"></div>
                  <div className="relative z-10 w-16 h-16 rounded-xl border border-white/10 bg-dark-surface flex items-center justify-center mb-6 group-hover:border-cyan-bright/50 group-hover:text-cyan-bright transition-all duration-500 group-hover:-rotate-6">
                    <CalendarIcon className="w-8 h-8 text-cyan-muted group-hover:text-cyan-bright transition-colors" />
                  </div>
                  <h3 className="relative z-10 text-xl font-black text-white mb-3 tracking-wide">Lihat Jadual</h3>
                  <p className="relative z-10 text-sm text-text-light/60 font-medium leading-relaxed">Semak status kekosongan dan perancangan {currentModule}.</p>
                </div>

                <div 
                  onClick={() => {
                    const history = document.getElementById('request-history');
                    if (history) history.scrollIntoView({ behavior: 'smooth' });
                    else setState("idle");
                  }}
                  className="group relative overflow-hidden p-10 rounded-2xl transition-all duration-500 text-left cursor-pointer transform hover:-translate-y-2 border border-white/5 bg-dark-bg/40 backdrop-blur-md hover:border-cyan-bright/50 hover:bg-dark-surface/60 hover:shadow-2xl"
                >
                  <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-cyan-bright/5 rounded-full blur-3xl group-hover:bg-cyan-bright/10 transition-all duration-700"></div>
                  <div className="relative z-10 w-16 h-16 rounded-xl border border-white/10 bg-dark-surface flex items-center justify-center mb-6 group-hover:border-cyan-bright/50 group-hover:text-cyan-bright transition-all duration-500 group-hover:scale-110">
                    <LayoutDashboard className="w-8 h-8 text-cyan-muted group-hover:text-cyan-bright transition-colors" />
                  </div>
                  <h3 className="relative z-10 text-xl font-black text-white mb-3 tracking-wide">Semak Status</h3>
                  <p className="relative z-10 text-sm text-text-light/60 font-medium leading-relaxed">Pantau perkembangan kelulusan dan log permohonan {currentModule} anda.</p>
                </div>
              </div>
              
              <button 
                onClick={() => setState("idle")}
                className="mt-16 text-cyan-muted hover:text-cyan-bright text-[10px] font-bold uppercase tracking-[0.3em] flex items-center gap-2"
              >
                <ArrowLeft className="w-3 h-3" /> Kembali ke Utama
              </button>
            </motion.div>
          )}

          {state === "calendar" && (
            <motion.div
              key="calendar"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-8"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-dark-surface pb-8">
                <div>
                  <button 
                    onClick={reset}
                    className="group mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-cyan-muted hover:text-cyan-bright transition-colors"
                  >
                    <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" /> Exit Calendar
                  </button>
                  <h2 className="text-4xl font-light text-white tracking-tight">Fleet <span className="font-bold">Movement.</span></h2>
                  <p className="text-text-light/40 font-mono text-[10px] uppercase mt-1 tracking-widest">Global Fleet Sync: Status OK</p>
                </div>
                
                <div className="flex items-center gap-4 bg-dark-surface/30 p-2 rounded-sm border border-dark-surface">
                  <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 hover:bg-dark-surface rounded-sm text-cyan-bright focus:outline-none"><ChevronLeft className="w-4 h-4" /></button>
                  <span className="text-xs font-bold uppercase tracking-widest min-w-[120px] text-center">{format(currentMonth, 'MMMM yyyy')}</span>
                  <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 hover:bg-dark-surface rounded-sm text-cyan-bright focus:outline-none"><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-[1px] bg-dark-surface/30 border border-dark-surface overflow-hidden rounded-xl bg-dark-surface">
                 {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                   <div key={day} className="bg-dark-surface/50 p-4 text-center border-b border-dark-surface">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-muted">{day}</span>
                   </div>
                 ))}
                 
                 {eachDayOfInterval({
                    start: startOfMonth(currentMonth),
                    end: endOfMonth(currentMonth)
                 }).map((day, idx) => {
                    const dayRequests = requests.filter(r => {
                      const reqDate = r.data.butiran_perjalanan.tarikh_perlukan;
                      if (!reqDate) return false;
                      return reqDate.includes(format(day, 'dd/MM/yyyy')) || reqDate.includes(format(day, 'd/M/yyyy'));
                    });

                    return (
                      <div key={idx} className={`min-h-[140px] bg-dark-bg p-3 border-dark-surface/30 group hover:bg-dark-surface/5 transition-colors relative ${idx === 0 ? `col-start-${day.getDay() + 1}` : ''}`}>
                        <div className="flex justify-between items-start mb-3">
                          <span className={`text-[11px] font-mono ${isSameDay(day, new Date()) ? 'text-cyan-bright font-bold' : 'text-text-light/30'}`}>
                            {format(day, 'd')}
                          </span>
                          {isSameDay(day, new Date()) && <div className="w-1.5 h-1.5 rounded-full bg-cyan-bright animate-pulse"></div>}
                        </div>
                        <div className="space-y-1.5 max-h-[100px] overflow-y-auto custom-scrollbar">
                          {dayRequests.map((req, rIdx) => {
                            const vehicle = FLEET.find(v => v.id === req.data.jenis_kenderaan_dipohon.kenderaan_id);
                            return (
                              <div 
                                key={rIdx} 
                                className="text-[9px] p-2 bg-cyan-bright/5 border-l-2 border-cyan-bright text-cyan-bright truncate cursor-pointer hover:bg-cyan-bright/10 group/item transition-all"
                                onClick={() => {
                                  setSelectedRequest(req);
                                  setState("admin");
                                }}
                              >
                                <div className="font-bold flex items-center gap-1">
                                  <Car className="w-2.5 h-2.5" />
                                  {vehicle?.id || "N/A"}
                                </div>
                                <div className="text-text-light/60">{req.data.maklumat_pemohon.nama}</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                 })}
              </div>

              <div className="bg-dark-surface/20 border border-dark-surface rounded-xl p-8">
                <h3 className="text-xs font-bold uppercase tracking-[0.4em] text-cyan-bright mb-10 flex items-center gap-3">
                  <div className="w-2 h-2 bg-cyan-bright rounded-full"></div>
                  KENDERAAN_AKTIF.SYS
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
                  {FLEET.map(v => (
                    <div key={v.id} className="p-5 bg-dark-surface/30 border border-dark-surface rounded-lg group hover:border-cyan-bright/50 transition-all">
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-8 h-8 rounded-full bg-dark-bg border border-dark-surface flex items-center justify-center">
                           <Car className="w-4 h-4 text-cyan-muted group-hover:text-cyan-bright transition-colors" />
                        </div>
                        <span className="text-[9px] font-mono text-cyan-bright/40 uppercase tracking-widest">{v.type}</span>
                      </div>
                      <span className="text-[10px] font-mono text-cyan-muted block mb-1">REG_ID: {v.id}</span>
                      <span className="text-xs font-bold text-white tracking-widest uppercase">{v.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {state === "filling" && (
            <motion.div
              key="filling"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              className="max-w-4xl mx-auto"
            >
              <div className="mb-10">
                <button 
                  onClick={reset}
                  className="group mb-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-cyan-muted hover:text-cyan-bright transition-colors"
                >
                  <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" /> Kembali
                </button>
                <h2 className="text-4xl font-light text-white tracking-tight">Permohonan <span className="font-bold">Digital.</span></h2>
                <p className="text-text-light/40 font-mono text-[10px] uppercase mt-1 tracking-widest">Borang Permohonan Digital</p>
              </div>

              <form onSubmit={handleFormSubmit} className="space-y-8">
                {/* Section 1 */}
                <div className="bg-dark-surface/30 border border-dark-surface rounded-xl p-8">
                  <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-bright mb-8 border-b border-dark-surface pb-4">Bahagian I: Maklumat Pemohon</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormGroup label="Nama Pemohon">
                      <input 
                        className="form-input" 
                        value={formData.maklumat_pemohon.nama || ""} 
                        onChange={e => setFormData({...formData, maklumat_pemohon: {...formData.maklumat_pemohon, nama: e.target.value}})}
                        required
                      />
                    </FormGroup>
                    <FormGroup label="Emel Pemohon">
                      <input 
                        className="form-input" 
                        type="email"
                        value={formData.maklumat_pemohon.email || ""} 
                        onChange={e => setFormData({...formData, maklumat_pemohon: {...formData.maklumat_pemohon, email: e.target.value}})}
                        placeholder="pemohon@contoh.com"
                      />
                    </FormGroup>
                    <FormGroup label="Jawatan">
                      <input 
                        className="form-input" 
                        value={formData.maklumat_pemohon.jawatan || ""} 
                        onChange={e => setFormData({...formData, maklumat_pemohon: {...formData.maklumat_pemohon, jawatan: e.target.value}})}
                        required
                      />
                    </FormGroup>
                    <FormGroup label="Tempat Bertugas" colSpan={2}>
                      <input 
                        className="form-input" 
                        value={formData.maklumat_pemohon.tempat_bertugas || ""} 
                        onChange={e => setFormData({...formData, maklumat_pemohon: {...formData.maklumat_pemohon, tempat_bertugas: e.target.value}})}
                        required
                      />
                    </FormGroup>
                    <FormGroup label="No. Telefon Pejabat">
                      <input 
                        className="form-input" 
                        value={formData.maklumat_pemohon.no_tel_pejabat || ""} 
                        onChange={e => setFormData({...formData, maklumat_pemohon: {...formData.maklumat_pemohon, no_tel_pejabat: e.target.value}})}
                        required
                      />
                    </FormGroup>
                    <FormGroup label="No. Telefon Bimbit">
                      <input 
                        className="form-input" 
                        value={formData.maklumat_pemohon.no_tel_bimbit || ""} 
                        onChange={e => setFormData({...formData, maklumat_pemohon: {...formData.maklumat_pemohon, no_tel_bimbit: e.target.value}})}
                        required
                      />
                    </FormGroup>
                  </div>
                </div>

                {/* Section 2 */}
                <div className="bg-dark-surface/30 border border-dark-surface rounded-xl p-8">
                   <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-bright mb-8 border-b border-dark-surface pb-4">
                    {currentModule === "vehicle" ? "Bahagian II: Butiran Perjalanan" : 
                     currentModule === "meeting" ? "Bahagian II: Butiran Mesyuarat" : 
                     currentModule === "catering" ? "Bahagian II: Butiran Maklumat Tempahan" :
                     currentModule === "stationery" ? "Bahagian II: Butiran Permohonan" :
                     "Bahagian II: Butiran Aduan"}
                  </h3>
                  <div className="space-y-6">
                    <FormGroup label={
                      currentModule === "vehicle" ? "Tujuan Perjalanan" : 
                      currentModule === "complaint" ? "Perihal Kerosakan" : 
                      currentModule === "stationery" ? "Catatan Permohonan" :
                      "Nama Program / Mesyuarat"
                    }>
                      <textarea 
                        className="form-input min-h-[100px]" 
                        placeholder={
                          currentModule === "complaint" ? "Sila jelaskan kerosakan yang dialami secara terperinci..." : 
                          currentModule === "stationery" ? "Contoh: Untuk kegunaan mesyuarat bulanan..." :
                          ""
                        }
                        value={formData.butiran_perjalanan.tujuan || ""} 
                        onChange={e => setFormData({...formData, butiran_perjalanan: {...formData.butiran_perjalanan, tujuan: e.target.value}})}
                        required
                      />
                    </FormGroup>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormGroup label={currentModule === "complaint" ? "Tarikh Kerosakan Dikesan" : "Tarikh Program / Mesyuarat / Perlukan"}>
                        <input 
                          type="date"
                          className="form-input w-full [&::-webkit-calendar-picker-indicator]:invert" 
                          value={formData.butiran_perjalanan.tarikh_perlukan || ""} 
                          onChange={e => setFormData({...formData, butiran_perjalanan: {...formData.butiran_perjalanan, tarikh_perlukan: e.target.value}})}
                          required
                        />
                      </FormGroup>
                      {currentModule !== "stationery" && (
                        <FormGroup label={currentModule === "vehicle" ? "Waktu Bertolak" : currentModule === "complaint" ? "Waktu Dikesan" : "Waktu Mula"}>
                          <input 
                            type="time"
                            className="form-input w-full [&::-webkit-calendar-picker-indicator]:invert" 
                            value={formData.butiran_perjalanan.waktu_bertolak || ""} 
                            onChange={e => setFormData({...formData, butiran_perjalanan: {...formData.butiran_perjalanan, waktu_bertolak: e.target.value}})}
                            required
                          />
                        </FormGroup>
                      )}
                    </div>
                    {currentModule === "vehicle" ? (
                      <FormGroup label="Tempat Menunggu">
                        <input 
                          className="form-input" 
                          value={formData.butiran_perjalanan.tempat_menunggu || ""} 
                          onChange={e => setFormData({...formData, butiran_perjalanan: {...formData.butiran_perjalanan, tempat_menunggu: e.target.value}})}
                          required
                        />
                      </FormGroup>
                    ) : (
                      currentModule !== "stationery" && (
                        <FormGroup label={currentModule === "complaint" ? "Lokasi Kerosakan" : "Bilangan Peserta / Pax"}>
                          <input 
                            className="form-input" 
                            placeholder={currentModule === "complaint" ? "cth: Aras 3, Bilik 302" : "cth: 25"}
                            onChange={e => setFormData({...formData, butiran_perjalanan: {...formData.butiran_perjalanan, tempat_menunggu: e.target.value}})}
                            required
                          />
                        </FormGroup>
                      )
                    )}
                    
                    {currentModule === "stationery" && (
                       <div className="pt-4">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-[10px] uppercase font-bold text-text-light/40 tracking-widest">
                            Senarai Alat Tulis & Kuantiti
                          </span>
                          <button type="button" onClick={addPassenger} className="text-cyan-bright text-[10px] font-bold uppercase tracking-widest hover:underline">+ Tambah Item</button>
                        </div>
                        <div className="space-y-3">
                          {formData.butiran_perjalanan.penumpang.map((p, idx) => (
                            <div key={idx} className="flex gap-2">
                              <select 
                                className="form-input flex-[3]"
                                onChange={(e) => {
                                  const parts = p.split(" - Qty: ");
                                  const newParts = [e.target.value, parts[1] || "1"];
                                  updatePassenger(idx, `${newParts[0]} - Qty: ${newParts[1]}`);
                                }}
                              >
                                <option value="">-- Pilih Item --</option>
                                {STATIONERY_ITEMS.map(item => (
                                  <option key={item} value={item}>{item}</option>
                                ))}
                              </select>
                              <input 
                                className="form-input flex-1"
                                placeholder="Kuantiti"
                                type="number"
                                onChange={(e) => {
                                  const parts = p.split(" - Qty: ");
                                  const newParts = [parts[0] || "", e.target.value];
                                  updatePassenger(idx, `${newParts[0]} - Qty: ${newParts[1]}`);
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {currentModule === "vehicle" && (
                       <div className="pt-4">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-[10px] uppercase font-bold text-text-light/40 tracking-widest">
                            Senarai Penumpang
                          </span>
                          <button type="button" onClick={addPassenger} className="text-cyan-bright text-[10px] font-bold uppercase tracking-widest hover:underline">+ Tambah Nama</button>
                        </div>
                        <div className="space-y-3">
                          {formData.butiran_perjalanan.penumpang.map((p, idx) => (
                            <input 
                              key={idx}
                              className="form-input" 
                              placeholder={`Nama #${idx + 1}`}
                              value={p}
                              onChange={e => updatePassenger(idx, e.target.value)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Section 3 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-dark-surface/30 border border-dark-surface rounded-xl p-8">
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-bright mb-8 border-b border-dark-surface pb-4">
                      {currentModule === "vehicle" ? "Jenis Kenderaan" : 
                       currentModule === "meeting" ? "Pilihan Bilik" : 
                       currentModule === "catering" ? "Masa Hidangan" :
                       currentModule === "stationery" ? "Status Stok" :
                       "Kategori Kerosakan"}
                    </h3>
                    <div className="grid grid-cols-1 gap-4 overflow-y-auto max-h-[400px] pr-2 custom-scrollbar">
                      {currentModule === "vehicle" && ["HILUX", "COMBIE (VAN/HIACE)"].map(type => (
                        <label key={type} className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-all ${
                          formData.jenis_kenderaan_dipohon.jenis === type 
                            ? "bg-cyan-bright/10 border-cyan-bright shadow-[0_0_15px_rgba(102,252,241,0.1)]" 
                            : "bg-dark-surface/30 border-dark-surface hover:bg-dark-surface/50"
                        }`}>
                          <input 
                            type="radio" 
                            name="vehicle_type" 
                            className="w-4 h-4 accent-cyan-bright"
                            checked={formData.jenis_kenderaan_dipohon.jenis === type}
                            onChange={() => setFormData({
                              ...formData, 
                              jenis_kenderaan_dipohon: {
                                ...formData.jenis_kenderaan_dipohon, 
                                jenis: type,
                                kenderaan_id: "" 
                              }
                            })}
                          />
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-white uppercase tracking-wider">{type}</span>
                            <span className="text-[10px] text-text-light/40 uppercase tracking-widest">Kategori RIASDA</span>
                          </div>
                        </label>
                      ))}

                      {currentModule === "meeting" && (
                        <div className="space-y-6">
                           <div className="space-y-4">
                             {MEETING_ROOMS.map(room => (
                               <label key={room.id} className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-all ${
                                 formData.jenis_kenderaan_dipohon.kenderaan_id === room.id 
                                   ? "bg-cyan-bright/10 border-cyan-bright shadow-[0_0_15px_rgba(102,252,241,0.1)]" 
                                   : "bg-dark-surface/30 border-dark-surface hover:bg-dark-surface/50"
                               }`}>
                                 <input 
                                   type="radio" 
                                   name="room_type" 
                                   className="w-4 h-4 accent-cyan-bright"
                                   checked={formData.jenis_kenderaan_dipohon.kenderaan_id === room.id}
                                   onChange={() => setFormData({
                                     ...formData, 
                                     jenis_kenderaan_dipohon: {
                                       ...formData.jenis_kenderaan_dipohon, 
                                       jenis: room.name,
                                       kenderaan_id: room.id
                                     }
                                   })}
                                 />
                                 <div className="flex flex-col">
                                   <span className="text-sm font-bold text-white uppercase tracking-wider">{room.name}</span>
                                 </div>
                               </label>
                             ))}
                           </div>

                           <div className="mt-8 pt-8 border-t border-dark-surface/50">
                              <label className="flex items-center gap-4 cursor-pointer group mb-6">
                                <div className="relative flex items-center">
                                  <input 
                                    type="checkbox" 
                                    className="peer sr-only"
                                    checked={formData.makanan?.perlu_makanan}
                                    onChange={(e) => setFormData({
                                      ...formData,
                                      makanan: {
                                        ...formData.makanan!,
                                        perlu_makanan: e.target.checked
                                      }
                                    })}
                                  />
                                  <div className="w-10 h-5 bg-dark-surface rounded-full peer-checked:bg-cyan-bright/30 transition-colors"></div>
                                  <div className="absolute left-1 w-3 h-3 bg-text-light/50 rounded-full peer-checked:translate-x-5 peer-checked:bg-cyan-bright transition-all"></div>
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-light group-hover:text-white transition-colors">
                                  Serta Tempahan Makanan?
                                </span>
                              </label>

                              {formData.makanan?.perlu_makanan && (
                                 <motion.div 
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  className="space-y-4"
                                 >
                                    <span className="text-[9px] uppercase font-bold text-cyan-bright tracking-widest block mb-2">Pilihan Menu (Waktu Hidangan)</span>
                                    <div className="grid grid-cols-1 gap-3">
                                      {CATERING_MENU.map(item => (
                                        <label key={item.id} className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-all ${
                                          formData.makanan?.jenis_makanan.includes(item.id) 
                                            ? "bg-cyan-bright/5 border-cyan-bright/40 shadow-sm" 
                                            : "bg-dark-bg border-dark-surface hover:bg-dark-surface/30"
                                        }`}>
                                          <input 
                                            type="checkbox" 
                                            className="w-3.5 h-3.5 accent-cyan-bright"
                                            checked={formData.makanan?.jenis_makanan.includes(item.id)}
                                            onChange={() => {
                                              const currentId = formData.makanan?.jenis_makanan || "";
                                              const newId = currentId.includes(item.id) 
                                                ? currentId.replace(item.id, '').replace(',,', ',').replace(/^,|,$/, '') 
                                                : currentId ? `${currentId},${item.id}` : item.id;
                                              
                                              setFormData({
                                                ...formData, 
                                                makanan: {
                                                  ...formData.makanan!, 
                                                  jenis_makanan: newId
                                                }
                                              })
                                            }}
                                          />
                                          <div className="flex flex-col">
                                            <span className="text-[11px] font-bold text-white uppercase tracking-wider">{item.name}</span>
                                          </div>
                                        </label>
                                      ))}
                                    </div>

                                    <div className="mt-4">
                                      <span className="text-[9px] uppercase font-bold text-cyan-bright tracking-widest block mb-2">Kaedah Hidangan</span>
                                      <select 
                                        className="form-input text-xs"
                                        value={formData.makanan?.kaedah_hidangan}
                                        onChange={(e) => setFormData({
                                          ...formData,
                                          makanan: {
                                            ...formData.makanan!,
                                            kaedah_hidangan: e.target.value
                                          }
                                        })}
                                      >
                                        <option value="">-- Pilih Kaedah --</option>
                                        {KAEDAH_HIDANGAN.map(k => (
                                          <option key={k} value={k}>{k}</option>
                                        ))}
                                      </select>
                                    </div>
                                 </motion.div>
                              )}
                           </div>
                        </div>
                      )}

                      {currentModule === "catering" && CATERING_MENU.map(item => (
                        <label key={item.id} className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-all ${
                          formData.jenis_kenderaan_dipohon.kenderaan_id === item.id 
                            ? "bg-cyan-bright/10 border-cyan-bright shadow-[0_0_15px_rgba(102,252,241,0.1)]" 
                            : "bg-dark-surface/30 border-dark-surface hover:bg-dark-surface/50"
                        }`}>
                          <input 
                            type="checkbox" 
                            name="menu_type" 
                            className="w-4 h-4 accent-cyan-bright"
                            checked={formData.jenis_kenderaan_dipohon.kenderaan_id.includes(item.id)}
                            onChange={() => {
                              const currentId = formData.jenis_kenderaan_dipohon.kenderaan_id;
                              const newId = currentId.includes(item.id) 
                                ? currentId.replace(item.id, '').replace(',,', ',').replace(/^,|,$/, '') 
                                : currentId ? `${currentId},${item.id}` : item.id;
                              
                              setFormData({
                                ...formData, 
                                jenis_kenderaan_dipohon: {
                                  ...formData.jenis_kenderaan_dipohon, 
                                  jenis: "Pilihan Makanan Terperinci",
                                  kenderaan_id: newId
                                }
                              })
                            }}
                          />
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-white uppercase tracking-wider">{item.name}</span>
                            <span className="text-[10px] text-text-light/40 uppercase tracking-widest">{item.description}</span>
                          </div>
                        </label>
                      ))}

                      {currentModule === "stationery" && (
                         <div className="p-10 text-center border border-dashed border-dark-surface rounded-xl opacity-40">
                            <Pencil className="w-12 h-12 mx-auto mb-4 text-cyan-bright" />
                            <p className="text-xs font-bold uppercase tracking-widest">Sila gunakan Bahagian II untuk senarai item.</p>
                         </div>
                      )}

                      {currentModule === "complaint" && COMPLAINT_CATEGORIES.map(cat => (
                        <label key={cat.id} className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-all ${
                          formData.jenis_kenderaan_dipohon.kenderaan_id === cat.id 
                            ? "bg-cyan-bright/10 border-cyan-bright shadow-[0_0_15px_rgba(102,252,241,0.1)]" 
                            : "bg-dark-surface/30 border-dark-surface hover:bg-dark-surface/50"
                        }`}>
                          <input 
                            type="radio" 
                            name="complaint_type" 
                            className="w-4 h-4 accent-cyan-bright"
                            checked={formData.jenis_kenderaan_dipohon.kenderaan_id === cat.id}
                            onChange={() => setFormData({
                              ...formData, 
                              jenis_kenderaan_dipohon: {
                                ...formData.jenis_kenderaan_dipohon, 
                                jenis: cat.name,
                                kenderaan_id: cat.id
                              }
                            })}
                          />
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-white uppercase tracking-wider">{cat.name}</span>
                            <span className="text-[10px] text-text-light/40 uppercase tracking-widest">Kategori Aduan</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="bg-dark-surface/30 border border-dark-surface rounded-xl p-8">
                    <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-bright mb-8 border-b border-dark-surface pb-4">
                      {currentModule === "vehicle" ? "Tujuan Penggunaan" : 
                       currentModule === "complaint" ? "Catatan Tambahan" : 
                       currentModule === "catering" ? "Kaedah Hidangan" :
                       "Keutamaan / Catatan"}
                    </h3>
                    <div className="space-y-4">
                      {currentModule === "catering" ? KAEDAH_HIDANGAN.map(kaedah => (
                        <label key={kaedah} className="flex items-center gap-3 cursor-pointer group">
                          <input 
                            type="radio" 
                            name="kaedah_hidangan" 
                            className="w-4 h-4 accent-cyan-bright"
                            checked={formData.jenis_kenderaan_dipohon.tujuan_penggunaan === kaedah}
                            onChange={() => setFormData({...formData, jenis_kenderaan_dipohon: {...formData.jenis_kenderaan_dipohon, tujuan_penggunaan: kaedah}})}
                          />
                          <span className="text-sm font-medium text-text-light group-hover:text-white transition-colors uppercase italic tracking-widest">{kaedah}</span>
                        </label>
                      )) : currentModule === "vehicle" ? ["Rasmi", "Tidak Rasmi / Sewa"].map(purpose => (
                        <label key={purpose} className="flex items-center gap-3 cursor-pointer group">
                          <input 
                            type="radio" 
                            name="usage_purpose" 
                            className="w-4 h-4 accent-cyan-bright"
                            checked={formData.jenis_kenderaan_dipohon.tujuan_penggunaan === purpose}
                            onChange={() => setFormData({...formData, jenis_kenderaan_dipohon: {...formData.jenis_kenderaan_dipohon, tujuan_penggunaan: purpose}})}
                          />
                          <span className="text-sm font-medium text-text-light group-hover:text-white transition-colors">{purpose}</span>
                        </label>
                      )) : (
                        <textarea 
                          className="form-input min-h-[120px]" 
                          placeholder={currentModule === "complaint" ? "cth: Jenama/Model peralatan yang rosak..." : "Sila masukkan catatan tambahan jika ada..."}
                          onChange={e => setFormData({...formData, jenis_kenderaan_dipohon: {...formData.jenis_kenderaan_dipohon, tujuan_penggunaan: e.target.value}})}
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-8">
                  <button 
                    type="submit"
                    className="px-12 py-4 bg-cyan-bright text-dark-bg rounded-sm font-black uppercase tracking-widest hover:bg-white transition-all shadow-[0_0_20px_rgba(102,252,241,0.3)]"
                  >
                    Hantar Permohonan
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {state === "processing" && (
            <motion.div
              key="processing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center justify-center min-h-[60vh] text-center"
            >
              <div className="relative w-40 h-40 mb-10">
                <div className="absolute inset-0 border-2 border-dark-surface rounded-full"></div>
                <motion.div 
                  className="absolute inset-0 border-t-2 border-cyan-bright rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                ></motion.div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="font-mono text-cyan-bright text-xs tracking-widest animate-pulse">ANALYZING...</span>
                </div>
              </div>
              <h2 className="text-3xl font-bold text-white mb-3 tracking-tight">Kompilasi Data Mula...</h2>
              <p className="text-text-light/50 max-w-sm font-mono text-[10px] uppercase tracking-widest">
                System status: Running check_health... [OK]
              </p>
            </motion.div>
          )}

          {state === "result" && result && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-10"
            >
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-dark-surface pb-10">
                <div>
                  <button 
                    onClick={reset}
                    className="group mb-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-cyan-muted hover:text-cyan-bright transition-colors"
                  >
                    <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" /> Back to Blueprint
                  </button>
                  <h2 className="text-4xl font-light text-white tracking-tight">Extraction <span className="font-bold">Schema.</span></h2>
                  <p className="text-text-light/40 font-mono text-[10px] uppercase mt-1 tracking-widest">Status: Output successful [14:02 UTC+8]</p>
                </div>
                <div className="flex gap-4">
                  <button 
                    onClick={() => copyToClipboard(JSON.stringify(result, null, 2))}
                    className="flex items-center gap-2 px-6 py-3 bg-dark-surface text-cyan-bright border border-cyan-muted/30 rounded-sm text-[11px] font-bold uppercase tracking-widest hover:bg-dark-surface/70 transition-all shadow-lg"
                  >
                    <Copy className="w-4 h-4" /> Copy Node
                  </button>
                  <button 
                    className="flex items-center gap-2 px-6 py-3 bg-cyan-bright text-dark-bg rounded-sm text-[11px] font-black uppercase tracking-widest hover:bg-white transition-all shadow-lg"
                    onClick={async () => {
                      if (!user) {
                        alert("Sila log masuk untuk menyimpan permohonan ke database.");
                        await loginWithGoogle();
                        return;
                      }
                      try {
                        await saveGenericRequest(user.uid, user.email || "", result, currentModule);
                        alert("Permohonan berjaya disimpan ke pangkalan data!");
                      } catch (err) {
                        alert("Gagal menyimpan permohonan.");
                      }
                    }}
                  >
                    <Download className="w-4 h-4" /> Save to Database
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                {/* Result Visual Cards */}
                <div className="lg:col-span-7 space-y-8">
                  <DataCard title="Maklumat Identiti Pemohon" icon={<User className="w-5 h-5 text-cyan-bright" />}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                      <LabelValue label="Identity Name" value={result.maklumat_pemohon.nama} />
                      <LabelValue label="Email Access" value={result.maklumat_pemohon.email} />
                      <LabelValue label="Designation" value={result.maklumat_pemohon.jawatan} />
                      <LabelValue label="Operation Base" value={result.maklumat_pemohon.tempat_bertugas} colSpan={2} />
                      <LabelValue label="Contact Office" value={result.maklumat_pemohon.no_tel_pejabat} />
                      <LabelValue label="Contact Mobile" value={result.maklumat_pemohon.no_tel_bimbit} />
                    </div>
                  </DataCard>

                  <DataCard title={currentModule === "vehicle" ? "Logistik Perjalanan" : currentModule === "meeting" ? "Logistik Mesyuarat" : currentModule === "catering" ? "Logistik Tempahan Makanan" : currentModule === "stationery" ? "Logistik Permohonan Alat Tulis" : "Logistik Aduan"} icon={<MapPin className="w-5 h-5 text-cyan-bright" />}>
                    <div className="space-y-6">
                      <LabelValue label={currentModule === "vehicle" ? "Mission Objective" : currentModule === "complaint" ? "Perihal Kerosakan" : currentModule === "stationery" ? "Tujuan Permohonan" : "Tujuan / Tajuk Program"} value={result.butiran_perjalanan.tujuan} vertical />
                      <div className="grid grid-cols-2 gap-6">
                        <LabelValue label="Tarikh Perlukan" value={result.butiran_perjalanan.tarikh_perlukan} />
                        <LabelValue label={currentModule === "vehicle" ? "Departure Timestamp" : currentModule === "stationery" ? "Tarikh Laporan" : "Start/Detected Timestamp"} value={result.butiran_perjalanan.waktu_bertolak} />
                      </div>
                      <LabelValue label={currentModule === "vehicle" ? "Designated Pickup Point" : currentModule === "complaint" ? "Lokasi Kerosakan" : currentModule === "stationery" ? "Unit Pemohon" : "Bilangan Pax"} value={result.butiran_perjalanan.tempat_menunggu} />
                      {currentModule !== "catering" && currentModule !== "complaint" && currentModule !== "meeting" && (
                        <div className="mt-6 pt-6 border-t border-dark-surface/50">
                          <span className="text-[10px] uppercase font-bold text-cyan-bright tracking-widest block mb-4">
                            {currentModule === "vehicle" ? "Passenger Manifest" : "Item Manifest"}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {result.butiran_perjalanan.penumpang.length > 0 ? (
                              result.butiran_perjalanan.penumpang.map((p, i) => (
                                <span key={i} className="px-4 py-1.5 bg-dark-bg border border-cyan-muted/20 text-text-light rounded-sm text-xs font-medium tracking-tight whitespace-nowrap">{p}</span>
                              ))
                            ) : (
                              <span className="text-xs text-text-light/30 italic font-mono tracking-widest uppercase">Null manifest data detected</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </DataCard>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <DataCard 
                      title={currentModule === "vehicle" ? "Spesifikasi Kenderaan" : currentModule === "meeting" ? "Spesifikasi Bilik" : currentModule === "catering" ? "Klasifikasi Hidangan" : currentModule === "stationery" ? "Spesifikasi Item" : "Spesifikasi Aduan"} 
                      icon={<LayoutGrid className="w-5 h-5 text-cyan-bright" />}
                    >
                      <div className="space-y-4">
                        <LabelValue label={currentModule === "vehicle" ? "Vehicle Class" : currentModule === "meeting" ? "Room Selected" : currentModule === "catering" ? "Masa Hidangan" : currentModule === "stationery" ? "Jenis Permohonan" : "Kategori Aduan"} value={result.jenis_kenderaan_dipohon.jenis} />
                        <LabelValue label={currentModule === "vehicle" ? "Usage Category" : currentModule === "catering" ? "Kaedah Hidangan" : "Catatan Tambahan"} value={result.jenis_kenderaan_dipohon.tujuan_penggunaan} />
                      </div>
                    </DataCard>

                    {result.makanan?.perlu_makanan && (
                      <DataCard title="Maklumat Tambahan: Tempahan Makanan" icon={<Clock className="w-5 h-5 text-cyan-bright" />}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                          <LabelValue label="Pilihan Menu" value={result.makanan.jenis_makanan} />
                          <LabelValue label="Kaedah Hidangan" value={result.makanan.kaedah_hidangan} />
                        </div>
                      </DataCard>
                    )}
                    <DataCard title="Internal Approval Trace" icon={<CheckCircle2 className="w-5 h-5 text-cyan-bright" />}>
                      <div className="space-y-3">
                        <StatusBadge label="Pegawai Kenderaan (Semakan)" status={result.status_kelulusan.pegawai_kenderaan} />
                        <StatusBadge label="Ketua Unit Pentadbiran (Sokongan)" status={result.status_kelulusan.ketua_unit} />
                        <StatusBadge label="PRD (Kelulusan)" status={result.status_kelulusan.bahagian_pentadbiran} />
                        <StatusBadge label="Jawapan Pemandu" status={result.status_kelulusan.pemandu} />
                      </div>
                    </DataCard>
                  </div>
                </div>

                {/* JSON View */}
                <div className="lg:col-span-5 h-full">
                  <div className="bg-dark-surface/20 rounded-xl border border-cyan-muted/20 border-dashed h-[800px] overflow-hidden flex flex-col shadow-2xl">
                    <div className="p-4 border-b border-dark-surface bg-dark-surface/50 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                         <div className="w-2 h-2 rounded-full bg-cyan-bright shadow-[0_0_10px_rgba(102,252,241,0.5)]"></div>
                         <span className="text-[10px] font-mono text-cyan-bright uppercase tracking-widest">SYSTEM_FLOW_DIAGRAM.JSON</span>
                      </div>
                      <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-dark-bg border border-dark-surface"></div>
                        <div className="w-2.5 h-2.5 rounded-full bg-dark-bg border border-dark-surface"></div>
                        <div className="w-2.5 h-2.5 rounded-full bg-dark-bg border border-dark-surface"></div>
                      </div>
                    </div>
                    <div className="flex-grow overflow-auto p-6 custom-scrollbar bg-dark-bg/40 backdrop-blur-sm">
                      <pre className="text-cyan-muted/80 font-mono text-[11px] leading-relaxed">
                        <code>{JSON.stringify(result, null, 2)}</code>
                      </pre>
                    </div>
                    <div className="p-4 text-[9px] font-mono text-cyan-bright/40 uppercase tracking-[0.3em] bg-dark-bg border-t border-dark-surface">
                      &gt; Schema validation complete... [SECURE]
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

           {state === "admin" && (adminRole || isDriver) && (
            <motion.div
              key="admin"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between border-b border-dark-surface pb-8">
                <div>
                  <button 
                    onClick={reset}
                    className="group mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-cyan-muted hover:text-cyan-bright transition-colors"
                  >
                    <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" /> Exit Dashboard
                  </button>
                  <h2 className="text-4xl font-light text-white tracking-tight">{isDriver ? 'Driver' : (adminRole === 'Pegawai Kenderaan' ? 'Pegawai Kenderaan / Tempahan' : (adminRole || 'Admin'))} <span className="font-bold">Dashboard.</span></h2>
                  <p className="text-text-light/40 font-mono text-[10px] uppercase mt-1 tracking-widest">
                    {isDriver ? 'Your Fleet Schedule' : `Control Level: ${adminRole} | ${requests.length} Requests_Detected`}
                  </p>
                </div>
                 <div className="flex gap-4">
                   {(adminRole === "Ketua Unit" || adminRole === "Ketua Unit Pentadbiran" || adminRole === "Admin") && (() => {
                      const pendingCount = requests.filter(r => 
                        r.data.status_kelulusan.ketua_unit === "MENUNGGU SOKONGAN"
                      ).length;
                      if (pendingCount > 0) {
                        return (
                          <div className="px-4 py-2 bg-cyan-bright/10 border border-cyan-bright/30 rounded-sm flex items-center gap-3 animate-pulse">
                             <Bell className="w-3 h-3 text-cyan-bright" />
                             <span className="text-[8px] md:text-[10px] font-bold uppercase tracking-widest text-cyan-bright">{pendingCount} NOTIFIKASI: MENUNGGU SOKONGAN</span>
                          </div>
                        );
                      }
                      return null;
                   })()}
                   {(adminRole === "Pegawai Kenderaan" || adminRole === "Admin") && (() => {
                      const pendingCount = requests.filter(r => {
                        if (r.data.status_kelulusan.ketua_unit !== "DISOKONG" || r.data.status_kelulusan.pegawai_kenderaan !== "MENUNGGU PENGESAHAN") return false;
                        
                        const isIzarul = user?.email?.toLowerCase() === 'izarul@risda.gov.my';
                        const isAdzaimin = user?.email?.toLowerCase() === 'adzaimin@risda.gov.my';

                        if (r.moduleType === 'complaint' && adminRole !== "Admin") {
                          const cat = r.data.jenis_kenderaan_dipohon.kenderaan_id;
                          if (cat === 'BANGUNAN' && !isIzarul) return false;
                          if (cat === 'ICT' && !isAdzaimin) return false;
                        }
                        
                        if (r.moduleType === 'stationery' && adminRole !== "Admin") {
                           const hasToner = r.data.butiran_perjalanan.penumpang.some((p: string) => p.toLowerCase().includes('toner'));
                           if (hasToner && !isAdzaimin) return false; 
                           if (!hasToner && !isIzarul) return false;
                        }
                        
                        return true;
                      }).length;
                      if (pendingCount > 0) {
                        return (
                          <div className="px-4 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-sm flex items-center gap-3 animate-pulse">
                             <Bell className="w-3 h-3 text-yellow-500" />
                             <span className="text-[8px] md:text-[10px] font-bold uppercase tracking-widest text-yellow-500">{pendingCount} NOTIFIKASI: MENUNGGU SEMAKAN</span>
                          </div>
                        );
                      }
                      return null;
                   })()}
                   {(adminRole === "PRD" || adminRole === "Admin") && (() => {
                      const pendingCount = requests.filter(r => 
                        r.data.status_kelulusan.pegawai_kenderaan === "SAH" && 
                        r.data.status_kelulusan.bahagian_pentadbiran === "MENUNGGU KELULUSAN"
                      ).length;
                      if (pendingCount > 0) {
                        return (
                          <div className="px-4 py-2 bg-green-500/10 border border-green-500/30 rounded-sm flex items-center gap-3 animate-pulse">
                             <Bell className="w-3 h-3 text-green-500" />
                             <span className="text-[8px] md:text-[10px] font-bold uppercase tracking-widest text-green-500">{pendingCount} NOTIFIKASI: MENUNGGU KELULUSAN</span>
                          </div>
                        );
                      }
                      return null;
                   })()}
                   <div className="px-4 py-2 bg-dark-bg border border-dark-surface rounded-sm flex items-center gap-3">
                      <div className="w-2 h-2 bg-cyan-bright rounded-full animate-pulse"></div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-text-light/60">System_Control_Active</span>
                   </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Request List */}
                <div className="lg:col-span-4 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar pr-2">
                  {requests
                    .filter(req => {
                       if (isDriver && !adminRole) {
                         if (req.moduleType && req.moduleType !== 'vehicle') return false;
                         const vehicle = FLEET.find(v => v.id === req.data.jenis_kenderaan_dipohon.kenderaan_id);
                         return vehicle?.driver.toLowerCase() === user?.email?.toLowerCase();
                       }
                       return true;
                    })
                    .map(req => (
                    <div 
                      key={req.id}
                      onClick={() => setSelectedRequest(req)}
                      className={`p-5 border cursor-pointer transition-all ${
                        selectedRequest?.id === req.id 
                          ? "bg-dark-surface border-cyan-bright shadow-[0_0_15px_rgba(102,252,241,0.1)]" 
                          : (() => {
                              const isComplaint = req.moduleType === 'complaint';
                              const isStationery = req.moduleType === 'stationery';
                              const cat = req.data.jenis_kenderaan_dipohon.kenderaan_id;
                              const isIzarul = user?.email?.toLowerCase() === 'izarul@risda.gov.my';
                              const isAdzaimin = user?.email?.toLowerCase() === 'adzaimin@risda.gov.my';
                              
                              let authForPegawai = false;
                              if (adminRole === "Admin") {
                                authForPegawai = true;
                              } else if (adminRole === "Pegawai Kenderaan") {
                                if (isComplaint) {
                                  if (cat === 'BANGUNAN' && isIzarul) authForPegawai = true;
                                  if (cat === 'ICT' && isAdzaimin) authForPegawai = true;
                                } else if (isStationery) {
                                  const hasToner = req.data.butiran_perjalanan.penumpang.some((p: string) => p.toLowerCase().includes('toner'));
                                  if (hasToner && isAdzaimin) authForPegawai = true;
                                  if (!hasToner && isIzarul) authForPegawai = true;
                                } else {
                                  authForPegawai = true; // For other modules like vehicle, meeting, catering, let Pegawai in based on pure role for now or adjust later if needed.
                                }
                              }
                              
                              if ((req.data.status_kelulusan.ketua_unit === "MENUNGGU SOKONGAN" && (adminRole === "Ketua Unit" || adminRole === "Ketua Unit Pentadbiran" || adminRole === "Admin")) ||
                                  (req.data.status_kelulusan.ketua_unit === "DISOKONG" && req.data.status_kelulusan.pegawai_kenderaan === "MENUNGGU PENGESAHAN" && authForPegawai) ||
                                  (req.data.status_kelulusan.pegawai_kenderaan === "SAH" && req.data.status_kelulusan.bahagian_pentadbiran === "MENUNGGU KELULUSAN" && (adminRole === "PRD" || adminRole === "Admin"))) {
                                return "bg-yellow-500/5 border-yellow-500/30 hover:bg-yellow-500/10 animate-pulse";
                              }
                              return "bg-dark-surface/30 border-dark-surface hover:bg-dark-surface/50";
                          })()
                      }`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                           <span className="text-[8px] font-mono text-cyan-muted tracking-widest uppercase">ID_{req.id.substring(0,8)}</span>
                           <span className="px-1.5 py-0.5 bg-dark-bg border border-dark-surface rounded-[2px] text-[7px] font-mono text-cyan-muted uppercase">{req.moduleType || 'V'}</span>
                           {(() => {
                              const isComplaint = req.moduleType === 'complaint';
                              const isStationery = req.moduleType === 'stationery';
                              const cat = req.data.jenis_kenderaan_dipohon.kenderaan_id;
                              const isIzarul = user?.email?.toLowerCase() === 'izarul@risda.gov.my';
                              const isAdzaimin = user?.email?.toLowerCase() === 'adzaimin@risda.gov.my';
                              
                              let authForPegawai = false;
                              if (adminRole === "Admin") {
                                authForPegawai = true;
                              } else if (adminRole === "Pegawai Kenderaan") {
                                if (isComplaint) {
                                  if (cat === 'BANGUNAN' && isIzarul) authForPegawai = true;
                                  if (cat === 'ICT' && isAdzaimin) authForPegawai = true;
                                } else if (isStationery) {
                                  const hasToner = req.data.butiran_perjalanan.penumpang.some((p: string) => p.toLowerCase().includes('toner'));
                                  if (hasToner && isAdzaimin) authForPegawai = true;
                                  if (!hasToner && isIzarul) authForPegawai = true;
                                } else {
                                  authForPegawai = true;
                                }
                              }
                              
                              if ((req.data.status_kelulusan.ketua_unit === "MENUNGGU SOKONGAN" && adminRole?.includes("Ketua Unit")) ||
                                  (req.data.status_kelulusan.ketua_unit === "DISOKONG" && req.data.status_kelulusan.pegawai_kenderaan === "MENUNGGU PENGESAHAN" && authForPegawai) ||
                                  (req.data.status_kelulusan.pegawai_kenderaan === "SAH" && req.data.status_kelulusan.bahagian_pentadbiran === "MENUNGGU KELULUSAN" && adminRole === "PRD")) {
                                return <Bell className="w-2.5 h-2.5 text-yellow-500" />;
                              }
                              return null;
                           })()}
                        </div>
                        <div className={`w-2 h-2 rounded-full ${
                          req.data.status_kelulusan.bahagian_pentadbiran.includes("LULUS") ? "bg-green-500" : "bg-yellow-500"
                        }`}></div>
                      </div>
                      <h4 className="text-white text-xs font-bold uppercase tracking-tight mb-1">{req.data.maklumat_pemohon.nama}</h4>
                      <p className="text-[10px] text-text-light/40 truncate mb-4">{req.data.butiran_perjalanan.tujuan}</p>
                      <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-widest">
                        <span className="text-text-light/20">{req.createdAt ? new Date(req.createdAt.toDate()).toLocaleDateString() : 'Pending...'}</span>
                        <span className={req.data.status_kelulusan.bahagian_pentadbiran.includes("LULUS") ? "text-green-500" : "text-cyan-bright"}>
                          {req.data.status_kelulusan.pemandu === "DISAHKAN" ? "CONFIRMED" : 
                           req.data.status_kelulusan.pemandu === "DITOLAK" ? "REJECTED" : "AWAITING"}
                        </span>
                      </div>
                    </div>
                  ))}
                  {requests.length === 0 && (
                    <div className="p-10 text-center border border-dashed border-dark-surface rounded-lg opacity-30">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
                      <p className="text-[10px] font-bold uppercase tracking-widest">Searching_Data_Stream...</p>
                    </div>
                  )}
                </div>

                {/* Detail View */}
                <div className="lg:col-span-8">
                  {selectedRequest ? (
                    <div className="bg-dark-surface/20 border border-dark-surface rounded-xl p-8 space-y-10">
                      <div className="flex justify-between items-start">
                        <div>
                          <h2 className="text-2xl font-bold text-white uppercase tracking-tight">{selectedRequest.data.maklumat_pemohon.nama}</h2>
                          <p className="text-cyan-bright font-mono text-[10px] uppercase tracking-[0.3em] font-bold mt-1">{selectedRequest.userEmail}</p>
                        </div>
                        <div className="flex gap-2">
                           {isDriver && selectedRequest.data.status_kelulusan.pemandu === "MENUNGGU JAWAPAN" && (
                             <>
                               <button 
                                onClick={async () => {
                                  const updatedStatus = { ...selectedRequest.data.status_kelulusan, pemandu: "DISAHKAN" };
                                  await updateRequestStatus(selectedRequest.id, updatedStatus);
                                  setSelectedRequest(null);
                                }}
                                className="px-6 py-2 bg-green-500/20 border border-green-500 text-green-500 text-[10px] font-black uppercase tracking-widest hover:bg-green-500 hover:text-white transition-all rounded-sm"
                               > Accept Movement </button>
                               <button 
                                onClick={async () => {
                                  const updatedStatus = { ...selectedRequest.data.status_kelulusan, pemandu: "DITOLAK" };
                                  await updateRequestStatus(selectedRequest.id, updatedStatus);
                                  setSelectedRequest(null);
                                }}
                                className="px-6 py-2 bg-red-500/20 border border-red-500 text-red-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all rounded-sm"
                               > Deny Entry </button>
                             </>
                           )}
                           {adminRole && (
                             <div className="grid grid-cols-1 gap-3 w-full">
                               {/* Stage 1: Ketua Unit Pentadbiran */}
                               {(adminRole === "Admin" || adminRole === "Ketua Unit" || adminRole === "Ketua Unit Pentadbiran") && (
                                  <div className="p-4 bg-dark-bg/50 border border-dark-surface rounded-sm flex items-center justify-between">
                                     <div className="flex flex-col">
                                       <span className="text-[10px] font-bold text-text-light/40 uppercase tracking-widest">Sokongan</span>
                                       <span className="text-xs font-bold text-white uppercase tracking-tight">Ketua Unit Pentadbiran</span>
                                     </div>
                                     <div className="flex gap-2">
                                       <button 
                                         onClick={async () => {
                                           const updatedStatus = { ...selectedRequest.data.status_kelulusan, ketua_unit: "DISOKONG" };
                                           await updateRequestStatus(selectedRequest.id, updatedStatus);
                                         }}
                                         className="px-3 py-1.5 bg-green-500/10 border border-green-500/30 text-green-500 text-[10px] font-bold uppercase tracking-widest hover:bg-green-500 hover:text-white transition-all rounded-sm"
                                       > Sokong </button>
                                       <button 
                                         onClick={async () => {
                                           const updatedStatus = { ...selectedRequest.data.status_kelulusan, ketua_unit: "TIDAK DISOKONG" };
                                           await updateRequestStatus(selectedRequest.id, updatedStatus);
                                         }}
                                         className="px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-500 text-[10px] font-bold uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all rounded-sm"
                                       > Tolak </button>
                                     </div>
                                  </div>
                               )}

                               {/* Stage 2: Pegawai Tempahan / Kenderaan / Aduan / Alat Tulis */}
                               {(() => {
                                  let showStage2 = false;
                                  if (adminRole === "Admin") {
                                    showStage2 = true;
                                  } else if (adminRole === "Pegawai Kenderaan") {
                                    const isComplaint = selectedRequest.moduleType === 'complaint';
                                    const isStationery = selectedRequest.moduleType === 'stationery';
                                    const cat = selectedRequest.data.jenis_kenderaan_dipohon.kenderaan_id;
                                    const isIzarul = user?.email?.toLowerCase() === 'izarul@risda.gov.my';
                                    const isAdzaimin = user?.email?.toLowerCase() === 'adzaimin@risda.gov.my';
                                    
                                    if (isComplaint) {
                                      if (cat === 'BANGUNAN' && isIzarul) showStage2 = true;
                                      if (cat === 'ICT' && isAdzaimin) showStage2 = true;
                                    } else if (isStationery) {
                                      const hasToner = selectedRequest.data.butiran_perjalanan.penumpang.some((p: string) => p.toLowerCase().includes('toner'));
                                      if (hasToner && isAdzaimin) showStage2 = true;
                                      if (!hasToner && isIzarul) showStage2 = true;
                                    } else {
                                      showStage2 = true;
                                    }
                                  }
                                  return showStage2;
                               })() && (
                                   <div className="p-4 bg-dark-bg/50 border border-dark-surface rounded-sm space-y-4">
                                      <div className="flex items-center justify-between">
                                        <div className="flex flex-col">
                                          <span className="text-[10px] font-bold text-text-light/40 uppercase tracking-widest">Semakan</span>
                                          <span className="text-xs font-bold text-white uppercase tracking-tight">
                                            {selectedRequest.moduleType === 'vehicle' ? 'Pegawai Kenderaan' : 
                                             selectedRequest.moduleType === 'complaint' ? 'Pegawai Aduan Kerosakan' : 
                                             selectedRequest.moduleType === 'stationery' ? 'Pegawai Alat Tulis' :
                                             'Pegawai Tempahan'}
                                          </span>
                                        </div>
                                        <div className="flex gap-2">
                                          <button 
                                            onClick={async () => {
                                              const updatedStatus = { ...selectedRequest.data.status_kelulusan, pegawai_kenderaan: "SAH" };
                                              await updateRequestStatus(selectedRequest.id, updatedStatus);
                                            }}
                                            className="px-3 py-1.5 bg-green-500/10 border border-green-500/30 text-green-500 text-[10px] font-bold uppercase tracking-widest hover:bg-green-500 hover:text-white transition-all rounded-sm"
                                          > Sahkan </button>
                                          <button 
                                            onClick={async () => {
                                              const updatedStatus = { ...selectedRequest.data.status_kelulusan, pegawai_kenderaan: "KELIRU / TIDAK LENGKAP" };
                                              await updateRequestStatus(selectedRequest.id, updatedStatus);
                                            }}
                                            className="px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-500 text-[10px] font-bold uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all rounded-sm"
                                          > Tolak </button>
                                        </div>
                                      </div>
                                      
                                      {(!selectedRequest.moduleType || selectedRequest.moduleType === "vehicle") && (
                                        <div className="pt-2 border-t border-dark-surface/50 space-y-4">
                                        <div>
                                          <label className="text-[9px] font-bold text-cyan-bright uppercase tracking-widest block mb-2">Pilih Kenderaan Spesifik</label>
                                          <select 
                                            className="w-full bg-dark-bg border border-dark-surface text-white text-[11px] p-2 rounded-sm focus:border-cyan-bright outline-none mb-3"
                                            value={selectedRequest.data.jenis_kenderaan_dipohon.kenderaan_id || ""}
                                            onChange={async (e) => {
                                              const vId = e.target.value;
                                              const vehicle = FLEET.find(v => v.id === vId);
                                              if (vId === "") {
                                                await assignVehicle(selectedRequest.id, "");
                                              } else if (vehicle) {
                                                await assignFleetManually(selectedRequest.id, vehicle.id, vehicle.driver);
                                              }
                                            }}
                                          >
                                            <option value="">-- Tiada Kenderaan --</option>
                                            <optgroup label="HILUX" className="bg-dark-bg">
                                              {FLEET.filter(v => v.type === "HILUX").map(v => (
                                                <option key={v.id} value={v.id}>{v.name} ({v.id})</option>
                                              ))}
                                            </optgroup>
                                            <optgroup label="HIACE / COMBIE" className="bg-dark-bg">
                                              {FLEET.filter(v => v.type === "HIACE").map(v => (
                                                <option key={v.id} value={v.id}>{v.name} ({v.id})</option>
                                              ))}
                                            </optgroup>
                                          </select>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                          <div>
                                            <label className="text-[8px] font-bold text-text-light/40 uppercase tracking-widest block mb-1">Edit No. Kenderaan</label>
                                            <input 
                                              className="w-full bg-dark-bg/50 border border-dark-surface text-white text-[10px] p-2 rounded-sm focus:border-cyan-bright outline-none"
                                              value={selectedRequest.data.jenis_kenderaan_dipohon.kenderaan_id || ""}
                                              onChange={async (e) => {
                                                await assignVehicle(selectedRequest.id, e.target.value);
                                              }}
                                              placeholder="cth: SAB1234X"
                                            />
                                          </div>
                                          <div>
                                            <label className="text-[8px] font-bold text-text-light/40 uppercase tracking-widest block mb-1">Edit Pemandu (Email)</label>
                                            <input 
                                              className="w-full bg-dark-bg/50 border border-dark-surface text-white text-[10px] p-2 rounded-sm focus:border-cyan-bright outline-none"
                                              value={selectedRequest.data.status_kelulusan.pemandu_email || ""}
                                              onChange={async (e) => {
                                                const requestRef = doc(db, 'requests', selectedRequest.id);
                                                await updateDoc(requestRef, {
                                                  'data.status_kelulusan.pemandu_email': e.target.value,
                                                  updatedAt: serverTimestamp()
                                                });
                                              }}
                                              placeholder="pemandu@risda.gov.my"
                                            />
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                   </div>
                                )}

                               {/* Stage 3: PRD */}
                               {(adminRole === "Admin" || adminRole === "PRD") && (
                                 <div className="p-4 bg-dark-bg/50 border border-dark-surface rounded-sm flex items-center justify-between">
                                    <div className="flex flex-col">
                                      <span className="text-[10px] font-bold text-text-light/40 uppercase tracking-widest">Kelulusan</span>
                                      <span className="text-xs font-bold text-white uppercase tracking-tight">PRD (Pentadbiran)</span>
                                    </div>
                                    <div className="flex gap-2">
                                      <button 
                                        onClick={async () => {
                                          const updatedStatus = { ...selectedRequest.data.status_kelulusan, bahagian_pentadbiran: "DILULUSKAN" };
                                          await updateRequestStatus(selectedRequest.id, updatedStatus);
                                        }}
                                        className="px-3 py-1.5 bg-green-500/10 border border-green-500/30 text-green-500 text-[10px] font-bold uppercase tracking-widest hover:bg-green-500 hover:text-white transition-all rounded-sm"
                                      > Lulus </button>
                                      <button 
                                        onClick={async () => {
                                          const updatedStatus = { ...selectedRequest.data.status_kelulusan, bahagian_pentadbiran: "TIDAK DILULUSKAN" };
                                          await updateRequestStatus(selectedRequest.id, updatedStatus);
                                        }}
                                        className="px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-500 text-[10px] font-bold uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all rounded-sm"
                                      > Tolak </button>
                                    </div>
                                 </div>
                               )}
                             </div>
                           )}
                        </div>
                      </div>

                       <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-dark-surface/50">
                        <div className="space-y-6">
                           <LabelValue 
                            label={selectedRequest.moduleType === "complaint" ? "Perihal Kerosakan" : "Mission Objective"} 
                            value={selectedRequest.data.butiran_perjalanan.tujuan} 
                            vertical 
                           />
                           <LabelValue 
                            label={selectedRequest.moduleType === "complaint" ? "Tarikh Dikesan" : "Schedule Scope"} 
                            value={selectedRequest.data.butiran_perjalanan.tarikh_perlukan} 
                           />
                           <LabelValue 
                            label={selectedRequest.moduleType === "complaint" ? "Waktu Dikesan" : "Departure Time"} 
                            value={selectedRequest.data.butiran_perjalanan.waktu_bertolak} 
                           />
                        </div>
                        <div className="space-y-6">
                           <LabelValue 
                            label={selectedRequest.moduleType === "vehicle" ? "Vehicle Assigned" : selectedRequest.moduleType === "complaint" ? "Kategori Kerosakan" : "Pilihan Fasiliti/Menu"} 
                            value={`${selectedRequest.data.jenis_kenderaan_dipohon.jenis} (${selectedRequest.data.jenis_kenderaan_dipohon.kenderaan_id || 'N/A'})`} 
                           />
                           <LabelValue 
                            label={selectedRequest.moduleType === "complaint" ? "Lokasi Kerosakan" : "Usage Protocol"} 
                            value={selectedRequest.data.butiran_perjalanan.tempat_menunggu} 
                           />

                           {selectedRequest.data.makanan?.perlu_makanan && (
                             <div className="p-3 bg-cyan-bright/5 border border-cyan-bright/10 rounded-sm">
                               <span className="text-[8px] uppercase font-bold text-cyan-bright tracking-widest block mb-1">Nota: Termasuk Makanan</span>
                               <div className="space-y-1">
                                 <p className="text-[10px] text-white font-bold">{selectedRequest.data.makanan.jenis_makanan}</p>
                                 <p className="text-[9px] text-text-light/50">{selectedRequest.data.makanan.kaedah_hidangan}</p>
                               </div>
                             </div>
                           )}

                           <div className="pt-4">
                              <span className="text-[10px] uppercase font-bold text-cyan-bright tracking-widest block mb-4">Request Status</span>
                              <div className="space-y-2">
                                <StatusBadge label="Semakan (P. Kenderaan)" status={selectedRequest.data.status_kelulusan.pegawai_kenderaan} />
                                <StatusBadge label="Sokongan (K. Unit Pentadbiran)" status={selectedRequest.data.status_kelulusan.ketua_unit} />
                                <StatusBadge label="Kelulusan (PRD)" status={selectedRequest.data.status_kelulusan.bahagian_pentadbiran} />
                                <StatusBadge label="Jawapan Pemandu" status={selectedRequest.data.status_kelulusan.pemandu} />
                              </div>
                           </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-[60vh] border border-dashed border-dark-surface rounded-xl flex flex-col items-center justify-center opacity-20">
                      <AlertCircle className="w-12 h-12 mb-4" />
                      <p className="text-[10px] font-bold uppercase tracking-[0.3em]">Select_RequestID_To_Analyze</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {state === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center min-h-[50vh] text-center"
            >
              <div className="w-24 h-24 border border-red-500/30 bg-red-500/10 rounded-full flex items-center justify-center mb-8">
                <Loader2 className="w-12 h-12 text-red-500" />
              </div>
              <h2 className="text-3xl font-bold text-white mb-3">Runtime Exception</h2>
              <p className="text-red-400 font-mono text-xs mb-10 max-w-sm uppercase tracking-widest">{error || "CRITICAL_FLOW_INTERRUPTED"}</p>
              <button 
                onClick={reset}
                className="px-10 py-4 bg-white text-dark-bg rounded-sm font-black uppercase tracking-widest hover:bg-cyan-bright transition-all"
              >
                Re-Initialize
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="max-w-7xl mx-auto px-8 py-12 border-t border-dark-surface mt-20 flex flex-col md:flex-row items-center justify-between gap-6 text-[10px] tracking-[0.3em] text-text-light/20 font-bold uppercase">
        <p>CONFIDENTIAL PROPERTY OF SYSTEM ARCHITECTS GRP.</p>
        <div className="flex gap-10">
          <a href="#" className="hover:text-cyan-bright transition-colors">Privacy Protocal</a>
          <a href="#" className="hover:text-cyan-bright transition-colors">Terms of Matrix</a>
          <a href="#" className="hover:text-cyan-bright transition-colors">Emergency Protocol</a>
        </div>
      </footer>
    </div>
  );
}

function ModuleCard({ title, desc, icon, onClick, active }: { title: string, desc: string, icon: ReactNode, onClick: () => void, active: boolean }) {
  return (
    <div 
      onClick={onClick}
      className={`group relative overflow-hidden p-8 rounded-2xl transition-all duration-500 text-left cursor-pointer transform hover:-translate-y-2 ${
        active 
          ? "border border-cyan-bright glass-panel shadow-[0_10px_40px_rgba(56,189,248,0.2)]" 
          : "border border-white/5 bg-dark-bg/40 backdrop-blur-md hover:border-cyan-bright/50 hover:bg-dark-surface/60 hover:shadow-2xl"
      }`}
    >
      <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-cyan-bright/5 rounded-full blur-3xl group-hover:bg-cyan-bright/20 transition-all duration-700"></div>
      
      <div className={`relative z-10 w-16 h-16 rounded-xl border flex items-center justify-center mb-8 transition-all duration-500 ${
        active ? "border-cyan-bright bg-cyan-bright/20 text-cyan-bright shadow-[0_0_20px_rgba(56,189,248,0.4)]" : "border-white/10 bg-dark-surface text-cyan-muted group-hover:text-cyan-bright group-hover:border-cyan-bright/50 group-hover:rotate-6"
      }`}>
        <div className="transform scale-125">
          {icon}
        </div>
      </div>
      <h3 className="relative z-10 text-xl font-black text-white mb-3 tracking-wide">{title}</h3>
      <p className="relative z-10 text-sm text-text-light/60 font-medium leading-relaxed">{desc}</p>
    </div>
  );
}

function FeatureCard({ num, title, description }: { num: string, title: string, description: string }) {
  return (
    <div className="p-10 rounded-lg bg-dark-surface/30 border-l-4 border-cyan-bright hover:bg-dark-surface/50 transition-all group">
      <div className="font-mono text-cyan-muted text-xs mb-6 group-hover:text-cyan-bright transition-colors">{num}</div>
      <h3 className="text-white text-xs font-bold uppercase tracking-widest mb-3">{title}</h3>
      <p className="text-text-light/50 text-[11px] leading-relaxed uppercase tracking-tight">{description}</p>
    </div>
  );
}

function DataCard({ title, icon, children }: { title: string, icon: ReactNode, children: ReactNode }) {
  return (
    <div className="bg-dark-surface/40 border border-dark-surface rounded-lg p-8 relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-100 transition-opacity">
        {icon}
      </div>
      <div className="flex items-center gap-3 mb-8">
        <h3 className="font-bold text-xs uppercase tracking-[0.25em] text-cyan-bright">{title}</h3>
        <div className="h-[1px] flex-grow bg-dark-surface underline-offset-4 decoration-cyan-bright/30 decoration-dashed"></div>
      </div>
      {children}
    </div>
  );
}

function LabelValue({ label, value, colSpan, vertical }: { label: string, value: string | null, colSpan?: number, vertical?: boolean }) {
  return (
    <div className={`space-y-2 ${colSpan === 2 ? "col-span-2" : ""}`}>
      <span className="text-[9px] uppercase font-bold text-text-light/20 tracking-[0.2em] block">{label}</span>
      <div className={`text-sm tracking-tight ${value ? "text-white font-medium" : "text-text-light/10 italic font-mono tracking-widest uppercase"}`}>
        {value || "Null"}
      </div>
    </div>
  );
}

function StatusBadge({ label, status }: { label: string, status: string | null }) {
  const isOk = status?.toLowerCase().includes("disokong") || 
               status?.toLowerCase().includes("diluluskan") || 
               status?.toLowerCase().includes("sah") ||
               status?.toLowerCase().includes("disahkan");
  const isNo = status?.toLowerCase().includes("tidak") || status?.toLowerCase().includes("ditolak");
  const isPending = status?.toLowerCase().includes("menunggu");
  
  return (
    <div className="flex items-center justify-between p-3 rounded-sm bg-dark-bg/50 border border-dark-surface">
      <span className="text-[10px] font-bold text-text-light/40 uppercase tracking-widest">{label}</span>
      <span className={`text-[9px] uppercase font-bold px-3 py-1 border rounded-sm ${
        isOk ? "border-cyan-bright/50 text-cyan-bright bg-cyan-bright/5" : 
        isNo ? "border-red-500/50 text-red-500 bg-red-500/5" : 
        isPending ? "border-yellow-500/50 text-yellow-500 bg-yellow-500/5" :
        "border-text-light/20 text-text-light/40 bg-transparent"
      }`}>
        {status || "Awaiting_Val"}
      </span>
    </div>
  );
}

function FormGroup({ label, children, colSpan }: { label: string, children: ReactNode, colSpan?: number }) {
  return (
    <div className={`space-y-2 ${colSpan === 2 ? "md:col-span-2" : ""}`}>
      <label className="text-[10px] uppercase font-bold text-cyan-bright/40 tracking-widest">{label}</label>
      {children}
    </div>
  );
}
