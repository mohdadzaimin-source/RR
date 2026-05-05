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
  ShieldCheck,
  Shield,
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
  Bell,
  QrCode,
  Printer
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

type AppState = "idle" | "processing" | "result" | "error" | "filling" | "admin" | "calendar" | "hub" | "check_status";
type AppModule = "vehicle" | "meeting" | "catering" | "complaint" | "stationery";

export default function App() {
  const [state, setState] = useState<AppState>("idle");
  const [currentModule, setCurrentModule] = useState<AppModule>("vehicle");
  const [checkEmail, setCheckEmail] = useState("");
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
    // Fetch all requests, allowed for both guests and authenticated
    const q = query(collection(db, "requests"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => {
      console.error("Firestore onSnapshot error:", err);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    // Keep selectedRequest in sync with requests list
    if (selectedRequest) {
      const updated = requests.find(r => r.id === selectedRequest.id);
      if (updated) {
        setSelectedRequest(updated);
      }
    }
  }, [requests]);

  const [resultSource, setResultSource] = useState<"submission" | "check" | null>(null);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showQRModal, setShowQRModal] = useState<boolean>(false);
  const systemUrl = "https://ais-pre-wm26zkt4soctiqwv3vzcvm-808972491297.asia-southeast1.run.app";

  const handlePrintPdf = async (data: any, moduleType: string | undefined, id: string, dateStr: string) => {    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Sila benarkan 'Pop-ups' pada browser anda untuk mencetak, atau tekan butang ini dengan membuka pautan terus (Open in New Tab).");
      return;
    }

    const mp = data.maklumat_pemohon || {};
    const bp = data.butiran_perjalanan || {};
    const jk = data.jenis_kenderaan_dipohon || {};
    const status = data.status_kelulusan || {};
    
    const isVehicle = moduleType === 'vehicle' || !moduleType;
    let htmlContent = '';
    
    if (isVehicle) {
         const jenis = jk.jenis || '';
         const cg = (cond: boolean) => cond ? 'X' : '&nbsp;';
         const isBas = jenis.toLowerCase().includes('bas');
         const isVan = jenis.toLowerCase().includes('van') || jenis.toLowerCase().includes('hiace');
         const isKereta = jenis.toLowerCase().includes('kereta') || jenis.toLowerCase().includes('sedan') || jenis.toLowerCase().includes('perdana');
         const is4x4 = jenis.toLowerCase().includes('pacuan') || jenis.toLowerCase().includes('hilux');
         
         const isRasmi = jk.tujuan_penggunaan?.toLowerCase().includes('rasmi') && !jk.tujuan_penggunaan?.toLowerCase().includes('tidak');
         const isTidak = jk.tujuan_penggunaan?.toLowerCase().includes('tidak') || jk.tujuan_penggunaan?.toLowerCase().includes('sewa');
         
         htmlContent = `
            <div class="header-right">
              Lampiran I<br/>
              PK-RIS 04 (PINDAAN)
            </div>
            <div class="center-title">
              <div style="text-align: center;">
                 <svg width="60" height="70" viewBox="0 0 100 110" fill="none" stroke="black" stroke-width="2">
                   <path d="M50 5 L10 20 L10 60 C10 80 50 105 50 105 C50 105 90 80 90 60 L90 20 Z" />
                   <text x="50" y="60" font-family="Arial" font-size="22" font-weight="bold" text-anchor="middle" fill="black" stroke="none">RISDA</text>
                 </svg>
              </div>
              <h3 style="margin-top:5px; font-size:12pt;">BORANG PERMOHONAN MENGGUNAKAN KENDERAAN RASMI</h3>
            </div>

            <p>Tarikh: <strong>${dateStr}</strong></p>
            <p>
              Pengarah<br/>
              Bhg. Pentadbiran/PRN/PRD/J/B<br/>
              <span style="font-size: 8pt;">(Potong yang mana tidak berkenaan)</span>
            </p>

            <p>Tuan/Puan,</p>
            <p class="section-title" style="margin-bottom:20px;">PERMOHONAN MENGGUNAKAN KENDERAAN RASMI</p>

            <p class="section-title">Bahagian I (Diisi oleh pemohon)</p>

            <table class="form-table">
              <tr><td class="label-col">Nama Pemohon</td><td class="colon-col">:</td><td class="value-col">${mp.nama || ''}</td></tr>
              <tr><td class="label-col">Jawatan</td><td class="colon-col">:</td><td class="value-col">${mp.jawatan || ''}</td></tr>
              <tr><td class="label-col">Tempat Bertugas</td><td class="colon-col">:</td><td class="value-col">${mp.tempat_bertugas || ''}</td></tr>
            </table>
            
            <table class="form-table">
              <tr>
                <td style="width:25%">No. Telefon Pejabat</td>
                <td style="width:5%; text-align:center;">:</td>
                <td style="width:25%; border-bottom: 1px solid #000; font-weight:bold;">${mp.no_tel_pejabat || ''}</td>
                <td style="width:10%; text-align:right; padding-right:10px;">Samb.:</td>
                <td style="width:15%; border-bottom: 1px solid #000; font-weight:bold;"></td>
                <td style="width:10%; text-align:right; padding-right:10px;">No. Tel. Bimbit :</td>
                <td style="width:25%; border-bottom: 1px solid #000; font-weight:bold;">${mp.no_tel_bimbit || ''}</td>
              </tr>
            </table>

            <table class="form-table">
               <tr><td class="label-col">Nama Penumpang<br/><span style="font-size:8pt; font-weight:normal;">(Jika Ada)</span></td><td class="colon-col">:</td><td class="value-col" style="vertical-align:bottom;">${(bp.penumpang || []).filter((p:any)=>p).join(', ') || '-'}</td></tr>
               <tr><td class="label-col">Tujuan Perjalanan</td><td class="colon-col">:</td><td class="value-col" style="vertical-align:bottom;">${bp.tujuan || ''}</td></tr>
               <tr><td></td><td></td><td style="font-size:8pt; text-align:center;">(Sila sertakan arahan bertugas)</td></tr>
            </table>

            <table class="form-table">
               <tr>
                 <td style="width:25%">Tarikh diperluka</td>
                 <td style="width:5%; text-align:center;">:</td>
                 <td style="width:10%">Daripada :</td>
                 <td style="width:25%; border-bottom: 1px solid #000; font-weight:bold;">${bp.tarikh_perlukan || ''}</td>
                 <td style="width:10%; text-align:right; padding-right:10px;">Hingga</td>
                 <td style="width:25%; border-bottom: 1px solid #000;"></td>
               </tr>
            </table>
            <table class="form-table">
               <tr>
                 <td style="width:25%">Tempat Menunggu</td>
                 <td style="width:5%; text-align:center;">:</td>
                 <td style="width:35%; border-bottom: 1px solid #000; font-weight:bold;">${bp.tempat_menunggu || ''}</td>
                 <td style="width:15%; text-align:right; padding-right:10px;">Waktu bertolak :</td>
                 <td style="width:20%; border-bottom: 1px solid #000; font-weight:bold;">${bp.waktu_bertolak || ''}</td>
               </tr>
            </table>

            <table class="form-table" style="margin-top:15px;">
              <tr>
                <td style="width:25%">Jenis Kenderaan</td>
                <td style="width:5%; text-align:center;">:</td>
                <td style="width:70%">
                   <span class="checkbox">${cg(isBas)}</span> Bas &nbsp;&nbsp;&nbsp;
                   <span class="checkbox">${cg(isVan)}</span> Van &nbsp;&nbsp;&nbsp;
                   <span class="checkbox">${cg(isKereta)}</span> Kereta &nbsp;&nbsp;&nbsp;
                   <span class="checkbox">${cg(is4x4)}</span> Pacuan 4 Roda
                </td>
              </tr>
              <tr>
                 <td style="padding-top:10px;">Tujuan Penggunaan</td>
                 <td style="padding-top:10px; text-align:center;">:</td>
                 <td style="padding-top:10px;">
                   <span class="checkbox">${cg(isRasmi)}</span> Rasmi &nbsp;&nbsp;&nbsp;
                   <span class="checkbox">${cg(isTidak)}</span> Tidak Rasmi / Sewa
                 </td>
              </tr>
            </table>

            <p class="section-title" style="margin-top:30px;">PENGAKUAN</p>
            <p>Dengan ini saya bersetuju mematuhi segala syarat-syarat Penggunaan / Penyewaan sebagaimana yang telah ditetapkan oleh Pengurusan RISDA.</p>

            <table style="width:100%; margin-top:30px;">
              <tr>
                <td style="width:50%">
                   <div class="sign-line" style="width:200px;"></div><br/>
                   Tandatangan Pemohon<br/><br/>
                   Tarikh: <strong>${dateStr}</strong>
                </td>
                <td></td>
              </tr>
            </table>
            
            <div style="text-align:center; margin-top:20px;">1</div>
            
            <div class="page-break"></div>
            
            <div class="header-right">
              Lampiran I<br/>
              PK-RIS 04 (PINDAAN)
            </div>

            <p class="section-title" style="margin-top:30px;">BAHAGIAN II (Semakan & Sokongan Ketua Unit)</p>
            <p>Permohonan serta perjalanan pegawai di atas adalah tugas rasmi / tidak rasmi adalah :<br/><br/>
               <strong>${status.ketua_unit === 'DISOKONG' ? '<strike>Tidak Disokong</strike> / Disokong' : status.ketua_unit === 'TIDAK DISOKONG' ? 'Tidak Disokong / <strike>Disokong</strike>' : 'Disokong / Tidak Disokong'}</strong>
               <span style="font-size:8pt; margin-left:10px;">(Potong yang mana tidak berkenaan)</span>
            </p>
            <p style="margin-top:20px;">Ulasan : <span style="display:inline-block; border-bottom:1px solid #000; width:80%; font-weight:bold; padding-left:10px;">${status.ketua_unit === 'DISOKONG' ? 'Disokong melalui Sistem' : ''}</span></p>
            <div style="border-bottom:1px solid #000; width:100%; height:20px; margin-bottom:20px;"></div>


            <table style="width:100%; margin-top:40px;">
              <tr>
                <td style="width:50%">Tandatangan & Cop : <span class="sign-line" style="width:150px;"></span></td>
                <td style="width:50%">Tarikh : <strong class="sign-line" style="width:150px; font-weight:bold; text-align:center;">${status.ketua_unit !== 'MENUNGGU SOKONGAN' ? dateStr : ''}</strong></td>
              </tr>
            </table>

            <p class="section-title" style="margin-top:50px;">BAHAGIAN III (Pengesahan Pegawai Kenderaan)</p>
            <p>Disahkan penggunaan ini <strong>${status.pegawai_kenderaan === 'SAH' ? 'mematuhi / <strike>tidak mematuhi</strike>' : status.pegawai_kenderaan === 'TIDAK SAH' || status.pegawai_kenderaan === 'KELIRU / TIDAK LENGKAP' ? '<strike>mematuhi</strike> / tidak mematuhi' : 'mematuhi / tidak mematuhi'}</strong> peraturan yang sedang berkuatkuasa :<br/>
               <span style="font-size:8pt;">(Potong yang mana tidak berkenaan)</span>
            </p>

            <table style="width:100%; margin-top:20px; border-collapse:collapse;">
              <tr>
                <td style="width:25%; vertical-align:bottom;">Kenderaan yang diluluskan:</td>
                <td style="width:40%; border-bottom:1px solid #000; vertical-align:bottom; font-weight:bold; text-align:center;">${jk.kenderaan_id || ''}</td>
                <td style="width:15%; vertical-align:bottom; text-align:right; padding-right:10px;">Model Kenderaan :</td>
                <td style="width:20%; border-bottom:1px solid #000; vertical-align:bottom; font-weight:bold; text-align:center;">${jk.kenderaan_id ? jk.jenis : ''}</td>
              </tr>
              <tr>
                <td></td>
                <td style="text-align:center; font-size:8pt;">(No. Pendaftaran Kenderaan)</td>
                <td></td>
                <td></td>
              </tr>
            </table>

            <table style="width:100%; margin-top:40px;">
              <tr>
                <td style="width:50%">Tandatangan & Cop : <span class="sign-line" style="width:150px;"></span></td>
                <td style="width:50%">Tarikh : <strong class="sign-line" style="width:150px; font-weight:bold; text-align:center;">${status.pegawai_kenderaan !== 'MENUNGGU PENGESAHAN' ? dateStr : ''}</strong></td>
              </tr>
            </table>

            <p class="section-title" style="margin-top:50px;">BAHAGIAN IV (Kelulusan & Perakuan Bhg. Pentadbiran/PRN/PRD/J/B)</p>
            <p>Permohonan serta perjalanan pegawai di atas adalah tugas rasmi / tidak rasmi adalah :<br/><br/>
               <strong>${status.bahagian_pentadbiran?.includes('LULUS') ? 'Diluluskan / <strike>Tidak Diluluskan</strike>' : status.bahagian_pentadbiran?.includes('TIDAK') ? '<strike>Diluluskan</strike> / Tidak Diluluskan' : 'Diluluskan / Tidak Diluluskan'}</strong>. <span style="font-size:8pt; margin-left:10px;">(Potong yang mana tidak berkenaan)</span>
            </p>

            <p style="margin-top:20px;">Ulasan : <span style="display:inline-block; border-bottom:1px solid #000; width:80%;"></span></p>
            <div style="border-bottom:1px solid #000; width:100%; height:20px; margin-bottom:20px;"></div>

            <table style="width:100%; margin-top:40px;">
              <tr>
                <td style="width:50%">Tandatangan & Cop : <span class="sign-line" style="width:150px;"></span></td>
                <td style="width:50%">Tarikh : <span class="sign-line" style="width:150px;"></span></td>
              </tr>
            </table>

            <div style="margin-top:40px; font-weight:bold; font-size:10pt;">
              ** Borang ini wajib diisi setiap kali bagi penggunaan /penyewaan kenderaan rasmi RISDA seperti yang tertakluk dalam Surat Pekeliling Bahagian Pentadbiran Bil. 7 Tahun 2019.
            </div>
            
            <div style="text-align:center; margin-top:20px;">2</div>
         `;
    } else {
         htmlContent = `
            <div style="text-align:center; margin-bottom: 30px;">
                <h2 style="margin-bottom:5px;">BORANG TEMPAHAN / ADUAN RASMI</h2>
                <p style="margin:0; font-weight:bold;">MODUL: ${(moduleType || '').toUpperCase()}</p>
                <p style="margin:0; font-size:9pt;">ID: ${id}</p>
            </div>
            
            <h3 style="border-bottom:1px solid #000; padding-bottom:5px;">MAKLUMAT PEMOHON</h3>
            <table style="width:100%; border-collapse:collapse; margin-bottom:30px;" border="1" cellpadding="8">
                <tr><td style="width:30%; font-weight:bold; background:#eee;">Nama Pemohon</td><td>${mp.nama || ''}</td></tr>
                <tr><td style="font-weight:bold; background:#eee;">Jawatan / Unit</td><td>${mp.jawatan || ''}</td></tr>
                <tr><td style="font-weight:bold; background:#eee;">No. Telefon</td><td>${mp.no_tel_pejabat || ''} / ${mp.no_tel_bimbit || ''}</td></tr>
            </table>

            <h3 style="border-bottom:1px solid #000; padding-bottom:5px;">BUTIRAN PERMOHONAN</h3>
            <table style="width:100%; border-collapse:collapse; margin-bottom:30px;" border="1" cellpadding="8">
                <tr><td style="width:30%; font-weight:bold; background:#eee;">Tujuan / Tajuk / Kerosakan</td><td>${bp.tujuan || ''}</td></tr>
                <tr><td style="font-weight:bold; background:#eee;">Tarikh Diperlukan</td><td>${bp.tarikh_perlukan || ''}</td></tr>
                <tr><td style="font-weight:bold; background:#eee;">Logistik / Lokasi / Fasiliti</td><td>${bp.tempat_menunggu || ''}</td></tr>
                <tr><td style="font-weight:bold; background:#eee;">Spesifikasi / Jenis</td><td>${jk.jenis || ''}</td></tr>
                <tr><td style="font-weight:bold; background:#eee;">Catatan Tambahan</td><td>${jk.tujuan_penggunaan || ''}</td></tr>
            </table>

            ${data.makanan?.perlu_makanan ? `
            <h3 style="border-bottom:1px solid #000; padding-bottom:5px;">MAKLUMAT MAKANAN</h3>
            <table style="width:100%; border-collapse:collapse; margin-bottom:30px;" border="1" cellpadding="8">
                <tr><td style="width:30%; font-weight:bold; background:#eee;">Pilihan Menu</td><td>${data.makanan.jenis_makanan}</td></tr>
                <tr><td style="font-weight:bold; background:#eee;">Kaedah Hidangan</td><td>${data.makanan.kaedah_hidangan}</td></tr>
            </table>` : ''}

            <h3 style="border-bottom:1px solid #000; padding-bottom:5px;">JEJAK KELULUSAN SISTEM</h3>
            <table style="width:100%; border-collapse:collapse; margin-bottom:30px;" border="1" cellpadding="8">
                <tr><td style="width:40%; font-weight:bold; background:#eee;">Semakan Pegawai Bertanggungjawab</td><td>${status.pegawai_kenderaan || 'MENUNGGU PENGESAHAN'}</td></tr>
                <tr><td style="font-weight:bold; background:#eee;">Sokongan Ketua Unit</td><td>${status.ketua_unit || 'MENUNGGU SOKONGAN'}</td></tr>
                <tr><td style="font-weight:bold; background:#eee;">Kelulusan Pentadbiran (PRD)</td><td>${status.bahagian_pentadbiran || 'MENUNGGU KELULUSAN'}</td></tr>
            </table>
         `;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Cetak PDF</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              font-size: 11pt; 
              color: #000; 
              background-color: #fff;
              padding: 0;
              margin: 0;
            }
            .page-break { page-break-before: always; }
            .header-right { text-align: right; font-size: 10pt; font-weight: bold; }
            .center-title { text-align: center; }
            .section-title { font-weight: bold; text-decoration: underline; margin-top: 20px; }
            table.form-table { width: 100%; border-collapse: collapse; margin-top: 5px; }
            table.form-table td { padding: 4px 0; vertical-align: bottom; }
            .label-col { width: 30%; }
            .colon-col { width: 5%; text-align: center; }
            .value-col { border-bottom: 1px dotted #000; font-weight: bold; }
            .checkbox { display: inline-block; width: 15px; height: 15px; border: 1px solid #000; text-align: center; line-height: 15px; font-size: 12px; margin-right: 5px; vertical-align: middle; }
            .sign-line { border-bottom: 1px dotted #000; width: 250px; display: inline-block; margin-bottom: 5px; }
            
            @media print {
              html, body { padding: 0 !important; margin: 0 !important; height: auto !important; }
              * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
            }
          </style>
        </head>
        <body class="antialiased">
          <div style="max-w-4xl mx-auto; padding: 2cm;">
            ${htmlContent}
          </div>
          <script>
            setTimeout(function() {
              window.print();
              setTimeout(function() {
                window.close();
              }, 100);
            }, 500);
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const exportToCSV = () => {
    // Flatten requests into exportable rows
    const headers = [
      "ID Permohonan", 
      "Tarikh Mohon", 
      "Modul Sistem", 
      "Nama Pemohon", 
      "Emel", 
      "Jawatan", 
      "Pejabat Operasi",
      "No. Tel",
      "Tujuan / Keterangan", 
      "Tarikh Diperlukan", 
      "Kenderaan / Spesifikasi",
      "Sokongan Ketua Unit", 
      "Semakan Pegawai", 
      "Kelulusan PRD",
      "Status Pemandu"
    ];
    
    const rows = requests.map(req => {
      const data = req.data || {};
      const mp = data.maklumat_pemohon || {};
      const bp = data.butiran_perjalanan || {};
      const sk = data.status_kelulusan || {};
      const jk = data.jenis_kenderaan_dipohon || {};

      return [
        req.id,
        req.createdAt ? new Date(req.createdAt.toDate()).toLocaleDateString() : 'Pending',
        req.moduleType || 'vehicle',
        mp.nama || 'N/A',
        req.userEmail || 'N/A',
        mp.jawatan || 'N/A',
        mp.tempat_bertugas || 'N/A',
        mp.no_tel_bimbit || mp.no_tel_pejabat || 'N/A',
        bp.tujuan || 'N/A',
        bp.tarikh_perlukan || 'N/A',
        jk.jenis || jk.tujuan_penggunaan || 'N/A',
        sk.ketua_unit || 'MENUNGGU SOKONGAN',
        sk.pegawai_kenderaan || 'MENUNGGU PENGESAHAN',
        sk.bahagian_pentadbiran || 'MENUNGGU KELULUSAN',
        sk.pemandu || 'TIADA BERKENAAN'
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Log_Data_RISDA_Beaufort_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintDriverReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Sila benarkan 'Pop-ups' pada browser anda untuk mencetak.");
      return;
    }

    const vehicleRequests = requests.filter(r => (!r.moduleType || r.moduleType === 'vehicle') && r.data?.status_kelulusan?.pegawai_kenderaan === "SAH");
    
    // Group by Driver Name or Registration Number
    const grouped: Record<string, any[]> = {};
    
    vehicleRequests.forEach(req => {
      let driverEmail = req.data?.status_kelulusan?.pemandu_email;
      let vehicleId = req.data?.jenis_kenderaan_dipohon?.kenderaan_id;
      
      let driverKey = driverEmail ? driverEmail : "TIADA PEMANDU DITETAPKAN";
      
      // Try to find matching FLEET name if possible
      let fleetMatch = null;
      if (vehicleId) {
         fleetMatch = Object.values(FLEET).find(f => f.id === vehicleId);
      } else if (driverEmail) {
         fleetMatch = Object.values(FLEET).find(f => f.driver === driverEmail);
      }
      
      if (fleetMatch && !driverEmail) {
         driverKey = fleetMatch.driver;
      }
      
      if (!grouped[driverKey]) grouped[driverKey] = [];
      grouped[driverKey].push(req);
    });

    let htmlContent = `
      <div style="text-align:center; margin-bottom: 30px;">
          <h2 style="margin-bottom:5px;">LAPORAN PERGERAKAN PEMANDU & KENDERAAN</h2>
          <p style="margin:0; font-size:10pt;">Tarikh Janaan: ${new Date().toLocaleDateString('ms-MY')} | Masa: ${new Date().toLocaleTimeString('ms-MY')}</p>
      </div>
    `;

    if (Object.keys(grouped).length === 0) {
       htmlContent += `<p style="text-align:center; margin-top:50px; font-style:italic;">Tiada pergerakan kenderaan yang sah setakat ini.</p>`;
    }

    Object.entries(grouped).forEach(([driver, rqs]) => {
      htmlContent += `
        <h3 style="background:#eee; padding:10px; border:1px solid #000; margin-bottom: 0;">PEMANDU: ${driver.toUpperCase()}</h3>
        <table style="width:100%; border-collapse:collapse; margin-bottom:30px;" border="1" cellpadding="8">
          <thead>
            <tr>
              <th style="width:15%">ID Permohonan</th>
              <th style="width:15%">Tarikh/Masa Bertolak</th>
              <th style="width:15%">Kenderaan / Plat</th>
              <th style="width:30%">Tujuan / Lokasi</th>
              <th style="width:15%">Pegawai Pemohon</th>
              <th style="width:10%">Status Pemandu</th>
            </tr>
          </thead>
          <tbody>
            ${rqs.map((r: any) => {
              const dEmail = r.data.status_kelulusan?.pemandu_email;
              const vId = r.data.jenis_kenderaan_dipohon?.kenderaan_id || '-';
              const fleetInfo = FLEET.find(f => f.driver === dEmail || f.id === vId);
              const driverDisplayName = fleetInfo ? fleetInfo.name : (dEmail || 'BELUM DITETAPKAN');
              const displayStatus = dEmail ? `${driverDisplayName} (${vId})` : 'BELUM DITETAPKAN';
              
              return `
              <tr>
                <td style="font-size:9pt; font-family:monospace;">${r.id}</td>
                <td>${r.data.butiran_perjalanan?.tarikh_perlukan || '-'} <br/> <small>${r.data.butiran_perjalanan?.waktu_bertolak || ''}</small></td>
                <td>${vId}</td>
                <td>${r.data.butiran_perjalanan?.tujuan || '-'} <br/> <small>${r.data.butiran_perjalanan?.tempat_menunggu || ''}</small></td>
                <td>${r.data.maklumat_pemohon?.nama || '-'}</td>
                <td>${displayStatus}</td>
              </tr>
            `;}).join('')}
          </tbody>
        </table>
      `;
    });

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Laporan Pergerakan Pemandu</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              font-size: 10pt; 
              color: #000; 
              background-color: #fff;
            }
            table th { background-color: #f9f9f9; text-align: left; }
            @media print {
              body { padding: 0cm; margin: 1cm; }
              html, body { height: auto !important; }
              * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
            }
          </style>
        </head>
        <body>
          <div style="max-w-4xl mx-auto; padding: 2cm;">
            ${htmlContent}
          </div>
          <script>
            setTimeout(function() {
              window.print();
              setTimeout(function() {
                window.close();
              }, 100);
            }, 500);
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

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
      bahagian_pentadbiran: "TIDAK PERLU", // By request, PRD approval is no longer strictly needed in flow
      pemandu: "BELUM DITETAPKAN"
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
    
    let finalData = { ...formData };

    if (!finalData.maklumat_pemohon.email || finalData.maklumat_pemohon.email.trim() === '') {
      alert("Sila penuhkan ruangan Emel anda dalam borang untuk membolehkan anda menyemak status permohonan.");
      return;
    }

    if (!finalData.maklumat_pemohon.nama || finalData.maklumat_pemohon.nama.trim() === '') {
      alert("Sila masukkan nama anda.");
      return;
    }

    // Move to processing state first
    setState("processing");

    // For stationery, it goes straight to the responsible officer, bypassing Unit Head.
    if (currentModule === 'stationery') {
      finalData.status_kelulusan = {
        ...finalData.status_kelulusan,
        ketua_unit: "DISOKONG"
      };
    }
    
    setResultSource("submission");
    setResult(finalData);

    // Auto-save to Firebase
    try {
      const saveEmail = finalData.maklumat_pemohon.email.trim().toLowerCase();
      const saveId = user ? user.uid : `guest_${Math.random().toString(36).substr(2, 9)}`;
      await saveGenericRequest(saveId, saveEmail, finalData, currentModule);
    } catch (err) {
      console.error("Failed to save request:", err);
    }

    // Wait a brief moment to show processing animation
    setTimeout(() => {
      setState("result");
    }, 1500);
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
                  className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-text-light/50 border border-dark-surface hover:text-cyan-bright hover:border-cyan-bright/50 px-4 py-2 rounded-sm transition-all"
                >
                  <LayoutDashboard className="w-3 h-3" /> Admin Login
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
              className="flex flex-col items-center text-center max-w-6xl mx-auto pt-8 pb-20"
            >
              {/* Virtual HUD Header */}
              <div className="w-full hidden md:flex justify-between items-center mb-12 opacity-40">
                <div className="flex items-center gap-4">
                  <div className="w-px h-8 bg-cyan-bright/50"></div>
                  <div className="flex flex-col items-start font-mono text-[8px] tracking-[0.3em]">
                    <span className="text-cyan-bright tracking-widest">SYSTEM_STATUS: ONLINE</span>
                    <span className="text-white/50 tracking-widest">SECURITY: ENCRYPTED</span>
                  </div>
                </div>
                <div className="flex items-center gap-12 font-mono text-[8px] tracking-[0.3em]">
                   <div className="flex flex-col items-end">
                      <span className="text-white/30 truncate">LAST_UPLINK: {new Date().toLocaleTimeString()}</span>
                      <span className="text-cyan-bright uppercase tracking-widest">BEAUFORT_SECURE_NODE</span>
                   </div>
                   <div className="w-px h-8 bg-cyan-bright/50"></div>
                </div>
              </div>

              <div className="relative mb-8">
                <div className="absolute inset-0 bg-cyan-bright/10 blur-[80px] rounded-full scale-150 opacity-20"></div>
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-cyan-bright/30 backdrop-blur-md bg-dark-surface/40 text-cyan-bright text-[10px] font-bold uppercase tracking-[0.25em] mb-8 shadow-[0_0_15px_rgba(56,189,248,0.15)]">
                  <span className="w-2 h-2 bg-cyan-bright rounded-full animate-pulse"></span>
                  RISDA_BEAUFORT_PORTAL_V2
                </div>
              </div>

              <h1 className="text-6xl md:text-8xl font-light text-white tracking-tighter leading-[1.1] mb-8">
                Pusat Kawalan <span className="font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-bright to-cyan-muted">Logistik.</span>
              </h1>
              <p className="text-lg md:text-xl text-text-light/50 max-w-2xl font-light leading-relaxed mb-16 tracking-wide italic">
                Platform Automasi Pejabat RISDA Daerah Beaufort. Integrasi perkhidmatan kenderaan, ruang mesyuarat, inventori, dan pemerkasaan logistik harian.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 xl:gap-8 w-full max-w-full relative z-10">
                <ModuleCard 
                  title="Kenderaan"
                  desc="Tempahan fleet & logistik."
                  icon={<Car className="w-8 h-8" />}
                  onClick={() => {
                    setCurrentModule("vehicle");
                    setState("hub");
                  }}
                  active={currentModule === "vehicle"}
                />
                <ModuleCard 
                  title="Mesyuarat"
                  desc="Akses & tempahan ruang."
                  icon={<MapPin className="w-8 h-8" />}
                  onClick={() => {
                    setCurrentModule("meeting");
                    setState("hub");
                  }}
                  active={currentModule === "meeting"}
                />
                <ModuleCard 
                  title="Katering"
                  desc="Pengurusan hidangan rasmi."
                  icon={<FileText className="w-8 h-8" />}
                  onClick={() => {
                    setCurrentModule("catering");
                    setState("hub");
                  }}
                  active={currentModule === "catering"}
                />
                <ModuleCard 
                  title="Aduan"
                  desc="Pelaporan & penyelenggaraan."
                  icon={<Wrench className="w-8 h-8" />}
                  onClick={() => {
                    setCurrentModule("complaint");
                    setState("hub");
                  }}
                  active={currentModule === "complaint"}
                />
                <ModuleCard 
                  title="Alat Tulis"
                  desc="Permohonan stok operasi."
                  icon={<Pencil className="w-8 h-8" />}
                  onClick={() => {
                    setCurrentModule("stationery");
                    setState("hub");
                  }}
                  active={currentModule === "stationery"}
                />
              </div>
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
                  onClick={() => setState("check_status")}
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

          {state === "check_status" && (
            <motion.div
              key="check_status"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-8 max-w-4xl mx-auto pt-8"
            >
              <div className="flex items-center gap-6 border-b border-dark-surface pb-8">
                <button 
                  onClick={() => setState("hub")}
                  className="p-3 bg-dark-surface hover:bg-cyan-bright/10 text-cyan-muted hover:text-cyan-bright rounded-full transition-all"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <h2 className="text-3xl font-light text-white tracking-tight">Semakan <span className="font-bold">Status.</span></h2>
                  <p className="text-text-light/50 text-xs mt-1">Sila masukkan emel yang digunakan semasa membuat permohonan.</p>
                </div>
              </div>

              <div className="bg-dark-surface/20 border border-dark-surface p-8 rounded-xl backdrop-blur-sm">
                <div className="flex gap-4 max-w-xl mx-auto">
                  <input 
                    type="email" 
                    value={checkEmail}
                    onChange={(e) => setCheckEmail(e.target.value)}
                    placeholder="Contoh: namaanda@gmail.com"
                    className="form-input flex-grow text-sm py-4!"
                  />
                  <button className="px-8 py-4 bg-cyan-bright text-dark-bg font-bold tracking-widest text-[10px] uppercase rounded-sm hover:bg-cyan-bright/90 transition-all">
                    Cari
                  </button>
                </div>
              </div>

              {checkEmail.length > 5 && (
                <div className="mt-12">
                  <h3 className="text-[10px] uppercase font-bold text-cyan-muted tracking-[0.2em] mb-6">Rekod Ditemui ({requests.filter(r => r.userEmail && r.userEmail.toLowerCase() === checkEmail.toLowerCase()).length})</h3>
                  <div className="grid grid-cols-1 gap-4">
                    {requests
                      .filter(r => r.userEmail && r.userEmail.toLowerCase() === checkEmail.toLowerCase())
                      .map((req, idx) => (
                      <motion.div 
                        key={req.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="p-6 bg-dark-bg border border-dark-surface hover:border-cyan-bright/30 transition-all rounded-lg flex flex-col md:flex-row justify-between items-center gap-6 relative overflow-hidden group cursor-pointer"
                        onClick={() => {
                          setResultSource("check");
                          // Normalize result data to match ExtractionResult interface expected by the result view
                          setResult({ ...req.data, id: req.id, moduleType: req.moduleType });
                          if (req.moduleType) setCurrentModule(req.moduleType as any);
                          setState("result");
                        }}
                      >
                        <div className="absolute top-0 left-0 w-1 h-full bg-cyan-bright opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="flex-grow max-w-full overflow-hidden">
                          <div className="flex flex-wrap items-center gap-3 mb-3">
                             <div className="px-2 py-0.5 bg-dark-surface border border-white/5 rounded text-[8px] font-mono text-cyan-muted uppercase">{req.moduleType || "V"}_{req.id.substring(0,8)}</div>
                             <span className="text-[10px] font-mono text-text-light/30 border-l border-dark-surface pl-3">{req.createdAt ? new Date(req.createdAt.toDate()).toLocaleString() : 'Saving...'}</span>
                          </div>
                          <h4 className="text-white text-base font-bold uppercase tracking-widest mb-1 truncate">{req.data.butiran_perjalanan.tujuan || "N/A"}</h4>
                          <div className="flex items-center gap-4 mt-3">
                            <div className="flex items-center gap-2 text-[10px] text-text-light/50 font-medium bg-dark-surface/50 px-3 py-1 rounded-full">
                              {req.moduleType === 'vehicle' && <Car className="w-3 h-3 text-cyan-muted" />}
                              {req.moduleType === 'meeting' && <MapPin className="w-3 h-3 text-cyan-muted" />}
                              {req.moduleType === 'catering' && <FileText className="w-3 h-3 text-cyan-muted" />}
                              {req.moduleType === 'complaint' && <Wrench className="w-3 h-3 text-cyan-muted" />}
                              {req.moduleType === 'stationery' && <Pencil className="w-3 h-3 text-cyan-muted" />}
                              <span className="uppercase">{req.moduleType || 'vehicle'}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 min-w-[250px]">
                           <StatusBadge label="Kelulusan Ketua" status={req.data.status_kelulusan.ketua_unit} />
                           {req.moduleType === 'vehicle' && <StatusBadge label="Tindakan P.Kenderaan" status={req.data.status_kelulusan.pegawai_kenderaan} />}
                           <StatusBadge label="Keputusan Akhir" status={req.data.status_kelulusan.bahagian_pentadbiran} />
                        </div>
                      </motion.div>
                    ))}
                    {requests.filter(r => r.userEmail && r.userEmail.toLowerCase() === checkEmail.toLowerCase()).length === 0 && (
                      <div className="p-12 text-center bg-dark-surface/5 border border-dashed border-dark-surface rounded-xl flex flex-col items-center justify-center opacity-40">
                         <Info className="w-8 h-8 mb-4 text-cyan-muted" />
                         <p className="text-[10px] font-bold uppercase tracking-[0.3em]">Tiada Rekod Dijumpai Untuk Emel Ini</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
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
                  <span className="font-mono text-cyan-bright text-xs tracking-widest animate-pulse">MENYIMPAN...</span>
                </div>
              </div>
              <h2 className="text-3xl font-bold text-white mb-3 tracking-tight">Menghantar Permohonan...</h2>
              <p className="text-text-light/50 max-w-sm font-mono text-[10px] uppercase tracking-widest">
                Data sedang direkodkan ke dalam sistem.
              </p>
            </motion.div>
          )}

          {state === "result" && result && (
            <motion.div
              id="result-to-print"
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-10"
            >
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-dark-surface pb-10 hide-on-print">
                <div>
                  <button 
                    onClick={reset}
                    className="group mb-6 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-cyan-muted hover:text-cyan-bright transition-colors"
                  >
                    <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" /> Kembali Ke Utama
                  </button>
                  <h2 className="text-4xl font-light text-white tracking-tight">
                    {resultSource === "submission" ? (
                      <>Permohonan <span className="font-bold">Berjaya.</span></>
                    ) : (
                      <>Status <span className="font-bold">Permohonan.</span></>
                    )}
                  </h2>
                  <p className="text-text-light/40 font-mono text-[10px] uppercase mt-1 tracking-widest">
                    {resultSource === "submission" ? "Status: Data berjaya direkodkan" : `ID: ${result.id}`}
                  </p>
                </div>
              </div>

               <div className="grid grid-cols-1 gap-10 max-w-4xl mx-auto">
                {resultSource === "check" && (
                  <DataCard title="RINGKASAN STATUS" icon={<ShieldCheck className="w-5 h-5 text-cyan-bright" />}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8 py-2">
                      <div className="space-y-6">
                        <LabelValue label="Nama Pemohon" value={result.maklumat_pemohon.nama} />
                        <LabelValue label="Tarikh & Masa" value={`${result.butiran_perjalanan.tarikh_perlukan} | ${result.butiran_perjalanan.waktu_bertolak}`} />
                        <LabelValue label="Tujuan Perjalanan" value={result.butiran_perjalanan.tujuan} vertical />
                        <LabelValue label="Tempat Menunggu" value={result.butiran_perjalanan.tempat_menunggu} />
                      </div>
                      <div className="space-y-6 bg-dark-bg/30 p-6 border border-dark-surface rounded-sm">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-cyan-bright tracking-widest block mb-3">Keputusan Akhir</span>
                          {(() => {
                             const isRejected = result.status_kelulusan.pegawai_kenderaan?.includes('TIDAK') || 
                                               result.status_kelulusan.ketua_unit?.includes('TIDAK') || 
                                               result.status_kelulusan.bahagian_pentadbiran?.includes('TIDAK');
                             const isApproved = result.status_kelulusan.bahagian_pentadbiran?.includes('LULUS') || 
                                               (currentModule === "vehicle" && result.status_kelulusan.ketua_unit === "DISOKONG");
                             
                             if (isRejected) return <div className="text-2xl font-black text-red-500 tracking-tighter">DITOLAK</div>;
                             if (isApproved) return <div className="text-2xl font-black text-green-500 tracking-tighter">LULUS</div>;
                             return <div className="text-2xl font-black text-yellow-500 tracking-tighter">DALAM PROSES</div>;
                          })()}
                        </div>
  
                        {(!currentModule || currentModule === "vehicle") && (
                          <div>
                            <span className="text-[10px] uppercase font-bold text-cyan-bright tracking-widest block mb-3">Kenderaan & Pemandu</span>
                            <div className="text-lg font-bold text-white tracking-tight">
                              {(() => {
                                const dEmail = result.status_kelulusan.pemandu_email;
                                const vId = result.jenis_kenderaan_dipohon.kenderaan_id;
                                if (!dEmail && !vId) return <span className="text-text-light/30 italic">Belum Ditetapkan</span>;
                                
                                const fleetInfo = FLEET.find(f => f.driver === dEmail || f.id === vId);
                                const driverName = fleetInfo ? fleetInfo.name : (dEmail || 'Pemandu');
                                return `${vId || 'N/A'} — ${driverName}`;
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </DataCard>
                )}
  
                <div className={`space-y-8 ${resultSource === "check" ? "opacity-60" : ""}`}>
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
                      <div className="space-y-3 relative hide-on-print">
                        <button 
                          onClick={() => handlePrintPdf(result, currentModule, 'DALAM_PROSES', new Date().toLocaleDateString('ms-MY'))}
                          className="absolute -top-12 right-0 px-3 py-1.5 bg-dark-surface/50 border border-cyan-bright/30 text-cyan-bright text-[10px] font-bold uppercase tracking-widest hover:bg-cyan-bright hover:text-dark-bg transition-all rounded-sm flex items-center gap-2"
                        >
                          <Printer className="w-3 h-3" /> Cetak PDF
                        </button>
                        <StatusBadge label="Pegawai Kenderaan (Semakan)" status={result.status_kelulusan.pegawai_kenderaan} />
                        <StatusBadge label="Ketua Unit Pentadbiran (Sokongan)" status={result.status_kelulusan.ketua_unit} />
                        {currentModule !== "vehicle" && (
                          <StatusBadge label="Kelulusan (PRD)" status={result.status_kelulusan.bahagian_pentadbiran} />
                        )}
                        {(!currentModule || currentModule === "vehicle") && (
                          <StatusBadge label="Jawapan Pemandu" status={result.status_kelulusan.pemandu} />
                        )}
                      </div>
                    </DataCard>
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
              className="space-y-8 flex-col"
            >
              <div className="flex items-center justify-between border-b border-dark-surface pb-8 hide-on-print">
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
                      const pendingCount = requests.filter(r => {
                        if (r.data.status_kelulusan.ketua_unit !== "MENUNGGU SOKONGAN") return false;
                        if (r.moduleType === "vehicle" && r.data.status_kelulusan.pemandu !== "DISAHKAN") return false;
                        return true;
                      }).length;
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
                        if (r.data.status_kelulusan.pegawai_kenderaan !== "MENUNGGU PENGESAHAN") return false;
                        if (r.moduleType !== "vehicle" && r.data.status_kelulusan.ketua_unit !== "DISOKONG") return false;
                        
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
                        r.moduleType !== "vehicle" &&
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
                   
                   {!isDriver && (
                     <>
                       <button 
                         onClick={() => setShowQRModal(true)}
                         className="px-4 py-2 border border-cyan-bright/30 bg-dark-bg text-cyan-bright hover:bg-cyan-bright hover:text-dark-bg text-[10px] font-bold uppercase tracking-widest rounded-sm transition-all flex items-center gap-2"
                       >
                         <QrCode className="w-3 h-3" /> QR Code
                       </button>
                       <button 
                         onClick={exportToCSV}
                         className="px-4 py-2 border border-cyan-bright/30 bg-dark-bg text-cyan-bright hover:bg-cyan-bright hover:text-dark-bg text-[10px] font-bold uppercase tracking-widest rounded-sm transition-all flex items-center gap-2"
                       >
                         <Download className="w-3 h-3" /> Eksport CSV
                       </button>
                       {(!currentModule || currentModule === 'vehicle') && (
                         <button 
                           onClick={handlePrintDriverReport}
                           className="px-4 py-2 border border-cyan-bright/30 bg-dark-bg text-cyan-bright hover:bg-cyan-bright hover:text-dark-bg text-[10px] font-bold uppercase tracking-widest rounded-sm transition-all flex items-center gap-2"
                         >
                           <Printer className="w-3 h-3" /> Laporan Pemandu
                         </button>
                       )}
                     </>
                   )}

                   <div className="px-4 py-2 bg-dark-bg border border-dark-surface rounded-sm flex items-center gap-3">
                      <div className="w-2 h-2 bg-cyan-bright rounded-full animate-pulse"></div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-text-light/60">System_Control_Active</span>
                   </div>
                </div>
              </div>

              {/* Module Filter Tabs */}
              <div className="flex flex-wrap items-center gap-2 mb-6 hide-on-print">
                <button 
                  onClick={() => setCurrentModule("vehicle")}
                  className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-sm border transition-all ${currentModule === 'vehicle' ? 'bg-cyan-bright text-dark-bg border-cyan-bright' : 'bg-dark-surface/30 border-dark-surface text-text-light/50 hover:bg-dark-surface/50'}`}
                >
                  Kenderaan
                </button>
                <button 
                  onClick={() => setCurrentModule("meeting")}
                  className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-sm border transition-all ${currentModule === 'meeting' ? 'bg-cyan-bright text-dark-bg border-cyan-bright' : 'bg-dark-surface/30 border-dark-surface text-text-light/50 hover:bg-dark-surface/50'}`}
                >
                  Mesyuarat
                </button>
                <button 
                  onClick={() => setCurrentModule("catering")}
                  className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-sm border transition-all ${currentModule === 'catering' ? 'bg-cyan-bright text-dark-bg border-cyan-bright' : 'bg-dark-surface/30 border-dark-surface text-text-light/50 hover:bg-dark-surface/50'}`}
                >
                  Makan/Minum
                </button>
                <button 
                  onClick={() => setCurrentModule("complaint")}
                  className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-sm border transition-all ${currentModule === 'complaint' ? 'bg-cyan-bright text-dark-bg border-cyan-bright' : 'bg-dark-surface/30 border-dark-surface text-text-light/50 hover:bg-dark-surface/50'}`}
                >
                  Aduan
                </button>
                <button 
                  onClick={() => setCurrentModule("stationery")}
                  className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-sm border transition-all ${currentModule === 'stationery' ? 'bg-cyan-bright text-dark-bg border-cyan-bright' : 'bg-dark-surface/30 border-dark-surface text-text-light/50 hover:bg-dark-surface/50'}`}
                >
                  Alat Tulis
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Request List */}
                <div className="lg:col-span-4 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar pr-2 hide-on-print">
                  {requests
                    .filter(req => {
                       const reqType = req.moduleType || 'vehicle';
                       if (reqType !== currentModule) return false;

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
                              
                              if (adminRole === "Admin" || (adminRole === "Pegawai Kenderaan" && authForPegawai)) {
                                if (req.data.status_kelulusan.pegawai_kenderaan === "MENUNGGU PENGESAHAN") return "bg-yellow-500/5 border-yellow-500/30 hover:bg-yellow-500/10 animate-pulse";
                              }
                              
                              if ((adminRole === "Ketua Unit" || adminRole === "Ketua Unit Pentadbiran" || adminRole === "Admin") && 
                                  req.data.status_kelulusan.ketua_unit === "MENUNGGU SOKONGAN" &&
                                  (req.moduleType !== "vehicle" || (req.moduleType === "vehicle" && req.data.status_kelulusan.pemandu === "DISAHKAN"))) {
                                return "bg-yellow-500/5 border-yellow-500/30 hover:bg-yellow-500/10 animate-pulse";
                              }

                              if ((adminRole === "PRD" || adminRole === "Admin") && 
                                  req.data.status_kelulusan.bahagian_pentadbiran === "MENUNGGU KELULUSAN" &&
                                  req.moduleType !== "vehicle") { // vehicle drops PRD
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
                              
                              if ((adminRole === "Admin" || (adminRole === "Pegawai Kenderaan" && authForPegawai)) && 
                                  req.data.status_kelulusan.pegawai_kenderaan === "MENUNGGU PENGESAHAN") return <Bell className="w-2.5 h-2.5 text-yellow-500" />;
                              
                              if ((adminRole === "Ketua Unit" || adminRole === "Ketua Unit Pentadbiran" || adminRole === "Admin") && 
                                  req.data.status_kelulusan.ketua_unit === "MENUNGGU SOKONGAN" &&
                                  (req.moduleType !== "vehicle" || (req.moduleType === "vehicle" && req.data.status_kelulusan.pemandu === "DISAHKAN"))) {
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
                    <div id="admin-to-print" className="bg-dark-surface/20 border border-dark-surface rounded-xl p-8 space-y-10">
                      <div className="flex justify-between items-start">
                        <div>
                          <h2 className="text-2xl font-bold text-white uppercase tracking-tight">{selectedRequest.data.maklumat_pemohon.nama}</h2>
                          <p className="text-cyan-bright font-mono text-[10px] uppercase tracking-[0.3em] font-bold mt-1">{selectedRequest.userEmail}</p>
                        </div>
                        <div className="flex gap-2 hide-on-print">
                           <button 
                             onClick={() => handlePrintPdf(selectedRequest.data, selectedRequest.moduleType, selectedRequest.id, selectedRequest.createdAt ? new Date(selectedRequest.createdAt.toDate()).toLocaleDateString('ms-MY') : new Date().toLocaleDateString('ms-MY'))}
                             className="px-4 py-2 bg-dark-bg border border-cyan-bright/30 text-cyan-bright text-[10px] font-bold uppercase tracking-widest hover:bg-cyan-bright hover:text-dark-bg transition-all rounded-sm flex items-center gap-2"
                           >
                              <Printer className="w-3 h-3" /> Cetak PDF
                           </button>

                           {adminRole && (
                             <div className="grid grid-cols-1 gap-3 w-full hide-on-print">
                               {/* Stage 1: Pegawai Kenderaan (for vehicle, this is first) */}
                               {(adminRole === "Admin" || adminRole === "Pegawai Kenderaan") && (
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
                                          <label className="text-[9px] font-bold text-cyan-bright uppercase tracking-widest block mb-2">Pilih Kenderaan Spesifik / Pemilihan Pemandu</label>
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
                                            <label className="text-[8px] font-bold text-text-light/40 uppercase tracking-widest block mb-1">Pilih Pemandu Bertugas</label>
                                            <select 
                                              className="w-full bg-dark-bg/50 border border-dark-surface text-white text-[10px] p-2 rounded-sm focus:border-cyan-bright outline-none"
                                              value={selectedRequest.data.status_kelulusan.pemandu_email || ""}
                                              onChange={async (e) => {
                                                const requestRef = doc(db, 'requests', selectedRequest.id);
                                                await updateDoc(requestRef, {
                                                  'data.status_kelulusan.pemandu_email': e.target.value,
                                                  'data.status_kelulusan.pemandu': 'DITETAPKAN',
                                                  updatedAt: serverTimestamp()
                                                });
                                              }}
                                            >
                                              <option value="">-- Pilih Pemandu --</option>
                                              {Array.from(new Set(FLEET.map(v => v.driver))).map(driverEmail => {
                                                const v = FLEET.find(f => f.driver === driverEmail);
                                                return (
                                                  <option key={driverEmail} value={driverEmail}>{driverEmail} ({v ? v.name : ''})</option>
                                                )
                                              })}
                                            </select>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                   </div>
                                )}

                               {/* Stage 3: Ketua Unit Pentadbiran (Now happens after Pegawai and Driver) */}
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
                                {selectedRequest.moduleType !== "vehicle" && (
                                  <StatusBadge label="Kelulusan (PRD) (Selain Kenderaan)" status={selectedRequest.data.status_kelulusan.bahagian_pentadbiran} />
                                )}
                                {(!selectedRequest.moduleType || selectedRequest.moduleType === "vehicle") && (
                                  <StatusBadge label="Jawapan Pemandu" status={selectedRequest.data.status_kelulusan.pemandu} />
                                )}
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

          {/* QR Code Modal */}
          <AnimatePresence>
            {showQRModal && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] flex items-center justify-center bg-dark-bg/90 backdrop-blur-sm p-4"
              >
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="bg-dark-surface border border-cyan-bright/30 p-8 max-w-sm w-full rounded-xl flex flex-col items-center text-center shadow-2xl relative"
                >
                  <button 
                    onClick={() => setShowQRModal(false)}
                    className="absolute top-4 right-4 text-text-light/40 hover:text-white transition-colors"
                  >
                    <XCircle className="w-6 h-6" />
                  </button>
                  <QrCode className="w-12 h-12 text-cyan-bright mb-4" />
                  <h3 className="text-xl font-bold text-white mb-2">Akses Pantas e-Portal</h3>
                  <p className="text-xs text-text-light/60 mb-6">Imbas kod QR ini menggunakan telefon pintar untuk log masuk dan paparan terus portal.</p>
                  
                  <div className="bg-white p-4 rounded-xl mb-6 shadow-[0_0_30px_rgba(102,252,241,0.2)] border border-cyan-bright">
                    {/* Using qrserver API to render a clean, high-res QR code */}
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(systemUrl)}`} 
                      alt="QR Code"
                      className="w-48 h-48"
                      crossOrigin="anonymous"
                    />
                  </div>

                  <button 
                    onClick={() => {
                      const a = document.createElement('a');
                      // Construct URL to force download
                      a.href = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(systemUrl)}&download=1`;
                      a.target = '_blank'; // Opens in new tab if direct download fails due to CORS
                      a.download = 'RISDA_Beaufort_Portal_QR.png';
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                    }}
                    className="w-full py-3 bg-cyan-bright text-dark-bg font-bold uppercase tracking-widest text-xs rounded-sm hover:bg-cyan-bright/90 transition-colors flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" /> Muat Turun Kod QR
                  </button>
                  <div className="mt-4 p-3 bg-cyan-bright/5 rounded border border-cyan-bright/20 w-full">
                     <p className="text-[10px] text-cyan-bright/80 font-mono text-left break-all">{systemUrl}</p>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

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
      className={`portal-card min-h-[220px] group relative overflow-hidden p-8 transition-all duration-500 text-left cursor-pointer transform hover:-translate-y-2 flex flex-col justify-between ${
        active 
          ? "border-cyan-bright/50 shadow-[0_10px_40px_rgba(56,189,248,0.2)] bg-cyan-bright/5" 
          : "hover:border-cyan-bright/30"
      }`}
    >
      <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-cyan-bright/10 rounded-full blur-3xl group-hover:bg-cyan-bright/30 transition-all duration-700"></div>
      
      <div className={`relative z-10 w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-all duration-500 ${
        active 
          ? "border border-cyan-bright bg-cyan-bright/20 text-cyan-bright shadow-[0_0_20px_rgba(56,189,248,0.4)] rotate-6" 
          : "border border-white/5 bg-dark-bg/80 text-cyan-muted group-hover:text-cyan-bright group-hover:border-cyan-bright/50 group-hover:bg-dark-surface"
      }`}>
        <div className={`transform transition-transform duration-500 ${active ? "scale-110" : "group-hover:scale-110"}`}>
          {icon}
        </div>
      </div>
      <div>
        <h3 className="relative z-10 text-xl font-black text-white mb-2 tracking-widest">{title}</h3>
        <p className="relative z-10 text-sm text-text-light/60 font-medium leading-relaxed italic">{desc}</p>
      </div>
      <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
        <span className="text-[8px] font-mono tracking-widest text-cyan-bright uppercase">Akses Modul</span>
        <ChevronRight className="w-3 h-3 text-cyan-bright" />
      </div>
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
