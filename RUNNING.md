# 🚀 วิธีการ Run Journaline Reader App

## 📋 ข้อกำหนดเบื้องต้น

- Node.js v18+ ติดตั้งแล้ว
- npm ติดตั้งแล้ว
- โปรเจคสร้าง dependencies แล้ว (`npm install`)

---

## ⚡ วิธีที่ 1: Run ทีเดียว (แนะนำ)

```bash
npm start
```

**ผลลัพธ์:**
- ✅ Express Server เปิดที่ **http://localhost:5001**
- ✅ Vite Frontend เปิดที่ **http://localhost:5173**
- ✅ Browser จะเปิดอัตโนมัติ (ถ้า Vite setting ให้เปิด)

---

## 🔄 วิธีที่ 2: Run แยก 2 Terminals

### **Terminal 1: Express Server (API)**
```bash
npm run dev:server
```
- Runs on: `http://localhost:5001`
- จัดการ: Upload/Save/Delete files, Validate XML

### **Terminal 2: Vite Frontend (UI)**
```bash
npm run dev
```
- Runs on: `http://localhost:5173`
- เปิด browser ไปที่ `http://localhost:5173`

---

## ✅ ตรวจสอบว่า Ready

### **Server ควรแสดง:**
```
✓ Audio server running on http://localhost:5001
  Upload endpoint: POST /api/upload-audio
```

### **Vite ควรแสดง:**
```
  VITE v5.4.21  ready in XXX ms

  ➜  Local:   http://localhost:5173/
```

### **Browser:**
- URL: `http://localhost:5173`
- เห็น Journaline Reader UI

---

## 🎯 ใช้งาน App

### **Upload XML File**
1. คลิก "Choose File" ในส่วน "Upload XML"
2. เลือกไฟล์ XML จาก `/public/data/`
   - `root_pythagoras_th.xml` (ขอแนะนำ)
   - `SimpleJournaline_Example.xml`
   - `FullJournaline_Example.xml`
3. กด "Save to Server"
4. ดูผลลัพธ์ validation:
   - ✅ **สีเขียว**: XML ถูกต้อง
   - ❌ **สีแดง**: XML ไม่ถูกต้อง (แสดง error details)

### **Upload Audio File**
1. คลิก "Choose File" ในส่วน "Upload Audio" 
2. เลือกไฟล์ audio (.mp3, .wav, .flac, .ogg)
3. กด "Upload"

### **View Sample XML**
- ส่วน "Sample XML" แสดงไฟล์ที่บันทึกไว้
- คลิกชื่อไฟล์เพื่อดูเนื้อหา
- คลิก "Delete" เพื่อลบไฟล์

---

## 🛑 หยุด Application

กด **Ctrl+C** ในแต่ละ Terminal

```bash
npm start    # ← กด Ctrl+C ตัวนี้ก่อน (ปิดทั้ง 2 servers)
```

---

## 📂 โครงสร้างไฟล์ที่สำคัญ

```
journaline-reader-app/
├── src/
│   ├── App.tsx          # React component หลัก
│   ├── parser.ts        # XML parsing logic
│   ├── audio.ts         # Audio handling
│   └── types.ts         # Type definitions
├── server.js            # Express server (API endpoints)
├── package.json         # Dependencies & scripts
├── public/
│   ├── data/
│   │   ├── Journaline.xsd        # XML Schema
│   │   ├── root.xml              # Sample XML
│   │   ├── root_pythagoras_th.xml
│   │   ├── *Example.xml
│   │   └── README.txt
│   ├── images/
│   │   └── pythagoras/          # Images referenced by XML
│   └── audio/
│       ├── audio-map.json       # Audio mapping config
│       └── *.mp3/.wav           # Audio files (user uploads)
└── README.md
```

---

## 🔌 API Endpoints

| Method | Endpoint | ใช้งาน |
|--------|----------|--------|
| `POST` | `/api/upload-xml` | บันทึก XML ไฟล์ |
| `GET` | `/api/saved-xmls` | ยืนยันรายชื่อ XML ที่บันทึก |
| `POST` | `/api/get-xml` | ดึงเนื้อหา XML |
| `DELETE` | `/api/delete-xml` | ลบ XML ไฟล์ |
| `POST` | `/api/validate-xml` | ตรวจสอบ XML vs Schema |
| `POST` | `/api/upload-audio` | บันทึก Audio ไฟล์ |

---

## 🐛 Troubleshooting

### **Port 5001/5173 ใช้งาน (Already in use)**
```bash
# หา process ที่ใช้ port
netstat -ano | findstr :5001

# Kill process (Windows)
taskkill /PID <PID> /F
```

### **Module not found errors**
```bash
# Reinstall dependencies
rm node_modules package-lock.json
npm install
```

### **Server crashes after upload**
- ตรวจสอบโฟลเดอร์ `/public/data/` และ `/public/audio/` มีอยู่
- ตรวจสอบ `Journaline.xsd` อยู่ใน `/public/data/`

### **Validation endpoint error**
- ตรวจสอบ `/public/data/Journaline.xsd` มี
- ลองเปลี่ยน XML content และ upload ใหม่

---

## 📝 Environment

- **Node.js**: v18+
- **npm**: latest
- **React**: 18.3.1
- **TypeScript**: 5.6.2
- **Vite**: 5.4.8
- **Express**: 4.18.2
- **libxmljs2**: 0.37.0 (XML validation)

---

**สำหรับคำถาม เพิ่มเติม ดู README.md หรือสอบถาม!** 👍
