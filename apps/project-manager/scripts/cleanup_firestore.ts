import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc, updateDoc, deleteField } from 'firebase/firestore';
import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load .env
dotenv.config();

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const DB_PATH = "D:\\Code Antinigaty\\Phan mem quan ly file V4\\1213.pmp";
const PROJECT_ID_NUM = 1;

async function runCleanup() {
  console.log("--- Bắt đầu quy trình dọn dẹp Firestore ---");
  
  // 1. Đọc IDs từ Local SQLite
  if (!fs.existsSync(DB_PATH)) {
    console.error("Không tìm thấy file DB:", DB_PATH);
    return;
  }

  const localDb = new sqlite3.Database(DB_PATH);
  const all = promisify(localDb.all.bind(localDb));

  console.log("Đang đọc dữ liệu local...");
  const events = await all("SELECT payload_json FROM design_events WHERE project_id = ?", [PROJECT_ID_NUM]) as any[];
  
  // Ở đây chúng ta nên lấy IDs từ bảng design_events hoặc reconstructed state.
  // Tuy nhiên, cách an toàn nhất là lấy từ MapState snapshot nếu có.
  const snapshotRow = await all("SELECT state_json FROM design_snapshots WHERE project_id = ?", [PROJECT_ID_NUM]) as any[];
  
  let localFeatureIds = new Set<string>();
  if (snapshotRow.length > 0) {
    const state = JSON.parse(snapshotRow[0].state_json);
    localFeatureIds = new Set(Object.keys(state.features || {}));
  } else {
    console.warn("Không tìm thấy snapshot, sẽ cần reconstruct state (bỏ qua bước này để đơn giản hóa nếu snapshot tồn tại).");
    // Backup: Nếu không có snapshot, có thể đọc trực tiếp từ design_events nhưng logic sẽ phức tạp.
    // Giả sử snapshot luôn tồn tại vì app lưu định kỳ.
  }

  console.log(`Tìm thấy ${localFeatureIds.size} features hợp lệ trong database local.`);

  // 2. Kiểm tra Firestore
  const projectDocRef = doc(db, 'design_projects', PROJECT_ID_NUM.toString());
  const featuresColRef = collection(projectDocRef, 'features');
  
  console.log("Đang quét Firestore subcollection...");
  const querySnapshot = await getDocs(featuresColRef);
  
  let deletedCount = 0;
  for (const featDoc of querySnapshot.docs) {
    if (!localFeatureIds.has(featDoc.id)) {
      console.log(`Xóa Feature rác: ${featDoc.id}`);
      await deleteDoc(featDoc.ref);
      deletedCount++;
    }
  }

  // 3. Xóa Legacy field 'features' trong doc chính
  console.log("Kiểm tra legacy 'features' field ở document chính...");
  await updateDoc(projectDocRef, {
    features: deleteField()
  }).catch(() => {});

  console.log(`--- Hoàn tất ---`);
  console.log(`Tổng cộng đã xóa ${deletedCount} features rác trên Cloud.`);
  
  localDb.close();
  process.exit(0);
}

runCleanup().catch(err => {
  console.error("Lỗi:", err);
  process.exit(1);
});
