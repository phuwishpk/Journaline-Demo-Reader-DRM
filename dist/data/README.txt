ไฟล์ในชุดนี้
- root_pythagoras_th.xml : ไฟล์ Journaline XML ภาษาไทย
- Journaline.xsd         : schema สำหรับตรวจโครงสร้าง (ถ้ามี)
- images/pythagoras/*    : รูปภาพที่ XML อ้างถึง

การใช้งาน
1) ถ้าใช้กับเว็บ UI:
   - วาง root_pythagoras_th.xml ไว้ใน public/data/
   - วางโฟลเดอร์ images/pythagoras/ ไว้ใน public/images/pythagoras/
   - เนื่องจาก XML ใช้ target แบบ /images/pythagoras/...
     รูปจึงจะถูกเรียกได้ทันทีจากแอปเว็บ

2) ถ้าใช้ตรวจใน VS Code:
   - วาง XML และ Journaline.xsd ไว้โฟลเดอร์เดียวกัน
   - เปิดไฟล์ XML แล้วใช้ XML extension ของ Red Hat เพื่อตรวจ schema

หมายเหตุ
- เนื้อหาทั้งหมดถูกแปลเป็นภาษาไทยจากภาพหน้าจอที่ผู้ใช้อัปโหลด
- หน้า 9 (ตัวอย่างการคำนวณ) ถูกจัดทำขึ้นให้สอดคล้องกับลำดับบทเรียน
  เนื่องจากในชุดภาพหน้าจอที่ได้รับ ไม่มีหน้าจอของหน้า 9 แสดงเนื้อหาเต็ม
