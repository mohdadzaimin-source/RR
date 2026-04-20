import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, serverTimestamp, query, where, getDocs, doc, getDoc, updateDoc, setDoc, orderBy, onSnapshot } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { ADMIN_MAPPING } from '../constants';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (error: any) {
    if (error.code === 'auth/popup-closed-by-user') {
      console.warn("User closed the sign-in popup.");
      return null;
    }
    throw error;
  }
};
export const logout = () => signOut(auth);

// Check if user is admin and return role
export const getAdminRole = async (uid: string): Promise<string | null> => {
  if (!uid) return null;
  const adminDoc = await getDoc(doc(db, 'admins', uid));
  if (adminDoc.exists()) {
    return adminDoc.data().role || "Admin";
  }
  return null;
};
 
// Re-sync admin role based on static mapping
export const syncUserAdminRole = async (user: any) => {
  if (!user || !user.email) return null;
  
  const mappedRole = ADMIN_MAPPING[user.email.toLowerCase()];
  if (mappedRole) {
    try {
      const adminDocRef = doc(db, 'admins', user.uid);
      await setDoc(adminDocRef, {
        email: user.email,
        role: mappedRole,
        lastSync: serverTimestamp()
      }, { merge: true });
      return mappedRole;
    } catch (err) {
      console.error("Admin sync failed (likely permission):", err);
      // Fallback to what's already in DB or just the mapped role in memory
      return mappedRole; 
    }
  }
  
  try {
    return await getAdminRole(user.uid);
  } catch (err) {
    console.error("Failed to fetch admin role:", err);
    return null;
  }
};

// Save a new request
export const saveGenericRequest = async (userId: string, email: string, data: any, moduleType: string) => {
  return addDoc(collection(db, 'requests'), {
    userId,
    userEmail: email,
    data,
    moduleType,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    status: 'PENDING'
  });
};

// Update request status
export const updateRequestStatus = async (requestId: string, statusData: any) => {
  const requestRef = doc(db, 'requests', requestId);
  return updateDoc(requestRef, {
    'data.status_kelulusan': statusData,
    updatedAt: serverTimestamp()
  });
};

// Assign a specific vehicle to a request
export const assignVehicle = async (requestId: string, vehicleId: string) => {
  const requestRef = doc(db, 'requests', requestId);
  return updateDoc(requestRef, {
    'data.jenis_kenderaan_dipohon.kenderaan_id': vehicleId,
    updatedAt: serverTimestamp()
  });
};

// Manually edit vehicle ID or driver email
export const assignFleetManually = async (requestId: string, vehicleId: string, driverEmail: string) => {
  const requestRef = doc(db, 'requests', requestId);
  return updateDoc(requestRef, {
    'data.jenis_kenderaan_dipohon.kenderaan_id': vehicleId,
    'data.status_kelulusan.pemandu_email': driverEmail,
    updatedAt: serverTimestamp()
  });
};
