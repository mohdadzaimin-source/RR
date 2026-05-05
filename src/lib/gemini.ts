import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface ExtractionResult {
  id?: string;
  moduleType?: string;
  maklumat_pemohon: {
    nama: string | null;
    email: string | null;
    jawatan: string | null;
    tempat_bertugas: string | null;
    no_tel_pejabat: string | null;
    no_tel_bimbit: string | null;
  };
  butiran_perjalanan: {
    tujuan: string | null;
    tarikh_perlukan: string | null;
    waktu_bertolak: string | null;
    tempat_menunggu: string | null;
    penumpang: string[];
  };
  jenis_kenderaan_dipohon: {
    jenis: string | null;
    kenderaan_id: string | null;
    tujuan_penggunaan: string | null;
  };
  status_kelulusan: {
    ketua_unit: string | null;
    pegawai_kenderaan: string | null;
    bahagian_pentadbiran: string | null;
    pemandu: string | null; // "DITETAPKAN" | "SIAP"
  };
  makanan?: {
    perlu_makanan: boolean;
    jenis_makanan: string;
    kaedah_hidangan: string;
  };
}

export async function extractDataFromImages(imagesBase64: string[]): Promise<ExtractionResult> {
  const model = "gemini-3.1-pro-preview"; // Use Pro for better Malaysian text extraction and layout understanding

  const imageParts = imagesBase64.map(base64 => ({
    inlineData: {
      mimeType: "image/jpeg",
      data: base64.split(",")[1], // Remove the data:image/jpeg;base64, prefix
    },
  }));

  const systemInstruction = `
    Anda adalah pakar pengekstrakan data dokumen (Document AI Specialist) untuk RISDA Malaysia. 
    Tugas anda adalah menerima imej borang "BORANG PERMOHONAN MENGGUNAKAN KENDERAAN RASMI".

    Tukarkan data dari imej tersebut kepada format JSON yang bersih dan berstruktur.
    
    PERATURAN:
    1. Ekstrak hanya NILAI data. Abaikan label arahan.
    2. Jenis Kenderaan: Hanya kenal pasti sama ada "HILUX" atau "COMBIE (VAN/HIACE)".
    3. Tujuan Penggunaan: Kenal pasti (Rasmi / Tidak Rasmi / Sewa).
    4. Bagi pilihan yang perlu dipotong (cth: "Disokong / Tidak Disokong"), kenal pasti pilihan yang kekal atau statusnya.
    5. Jika data kosong dalam imej, letakkan null.
    6. Tarikh dan waktu hendaklah dikekalkan format asalnya seperti dalam borang.
  `;

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      maklumat_pemohon: {
        type: Type.OBJECT,
        properties: {
          nama: { type: Type.STRING },
          email: { type: Type.STRING, description: "Email pemohon jika ada" },
          jawatan: { type: Type.STRING },
          tempat_bertugas: { type: Type.STRING },
          no_tel_pejabat: { type: Type.STRING },
          no_tel_bimbit: { type: Type.STRING },
        },
      },
      butiran_perjalanan: {
        type: Type.OBJECT,
        properties: {
          tujuan: { type: Type.STRING },
          tarikh_perlukan: { type: Type.STRING, description: "Format: Daripada ... Hingga ..." },
          waktu_bertolak: { type: Type.STRING },
          tempat_menunggu: { type: Type.STRING },
          penumpang: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
      },
      jenis_kenderaan_dipohon: {
        type: Type.OBJECT,
        properties: {
          jenis: { type: Type.STRING },
          tujuan_penggunaan: { type: Type.STRING },
        },
      },
      status_kelulusan: {
        type: Type.OBJECT,
        properties: {
          ketua_unit: { type: Type.STRING, description: "Status sokongan ketua unit" },
          pegawai_kenderaan: { type: Type.STRING, description: "Status pengesahan pegawai kenderaan" },
          bahagian_pentadbiran: { type: Type.STRING, description: "Status kelulusan bahagian pentadbiran" },
        },
      },
    },
    required: ["maklumat_pemohon", "butiran_perjalanan", "jenis_kenderaan_dipohon", "status_kelulusan"],
  };

  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [
        ...imageParts,
        { text: "Sila ekstrak data dari borang RISDA ini ke dalam format JSON." },
      ],
    },
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema,
    },
  });

  return JSON.parse(response.text || "{}");
}
