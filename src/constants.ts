export const FLEET = [
  { id: "SAB1658V", name: "HILUX SAB1658 V", type: "HILUX", driver: "syawasy@risda.gov.my" },
  { id: "SAB1647V", name: "HILUX SAB1647V", type: "HILUX", driver: "safwan.ahmad@risda.gov.my" },
  { id: "SAB4872D", name: "HILUX SAB4872D", type: "HILUX", driver: "ezzy.azmi@risda.gov.my" },
  { id: "SAB4338J", name: "HIACE COMBI/VAN SAB4338J", type: "HIACE", driver: "termizi.sawang@risda.gov.my" },
  { id: "SJP2865", name: "HILUX SJP2865", type: "HILUX", driver: "victor@risda.gov.my" }
];

export const ADMIN_MAPPING: Record<string, string> = {
  "izarul@risda.gov.my": "Pegawai Kenderaan",
  "adzaimin@risda.gov.my": "Pegawai Kenderaan",
  "syahrul.nizam@risda.gov.my": "Pegawai Kenderaan",
  "sulizah@risda.gov.my": "Ketua Unit Pentadbiran",
  "ira@risda.gov.my": "PRD",
  "mohdadzaimin@gmail.com": "Admin", // Maintaining your access
  "mohdadzaimin@googlemail.com": "Admin",
  "intergratedsrbft@gmail.com": "Admin"
};

export const MEETING_ROOMS = [
  { id: "BILIK_BEAUFORT", name: "BILIK MESYUARAT STESEN BEAUFORT" },
  { id: "BILIK_SIPITANG", name: "BILIK MESYUARAT STESEN SIPITANG" },
  { id: "BILIK_MESYUARAT", name: "BILIK MESYUARAT" },
  { id: "DEWAN_TERBUKA", name: "DEWAN TERBUKA" },
];

export const CATERING_MENU = [
  { id: "SARAPAN", name: "Sarapan Pagi (8.00 Pagi)", description: "Nasi Lemak / Mee Goreng + Teh/Kopi"},
  { id: "MINUM_PAGI", name: "Minum Pagi (10.00 Pagi)", description: "Kuih-muih + Teh/Kopi"},
  { id: "TENGAHARI", name: "Makan Tengahari (12.00 Tghri)", description: "Nasi Putih + Lauk-pauk + Air"},
  { id: "MINUM_PTG", name: "Minum Petang (3.00 Petang)", description: "Kuih-muih + Teh/Kopi"},
  { id: "MAKAN_MALAM", name: "Makan Malam (7.00 Malam)", description: "Nasi Putih + Lauk-pauk + Air"},
];

export const KAEDAH_HIDANGAN = ["BUFFET (BIASA / VIP / VVIP)", "BUNGKUS"];

export const STATIONERY_ITEMS = [
  "Pen Hitam",
  "Pen Biru",
  "Pen Merah",
  "Pensil",
  "Pemadam Pensil",
  "Salotape",
  "Double tape",
  "Gam air",
  "Kertas Putih",
  "Kertas Warna",
  "Binding ring",
  "Paper fastener",
  "Binder clips",
  "Stapler",
  "Dawai kokot",
  "Permanent marker",
  "Stamp pad",
  "Kalkulator",
  "Tali hijau",
  "Tali putih",
  "Toner Printer (Nyatakan Jenis/Kod Kod di Kuantiti atau Nota)"
];

export const COMPLAINT_CATEGORIES = [
  { id: "ICT", name: "ICT (Peralatan Komputer / LAN / Server)" },
  { id: "BANGUNAN", name: "Bangunan (Tandas / Lampu / Air / DLL)" },
];
