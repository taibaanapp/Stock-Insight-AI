# Stock Insight AI v0.1 (Web Edition)

ระบบวิเคราะห์หุ้นด้วย AI ทำงานผ่านเว็บเบราว์เซอร์

## วิธีการใช้งาน

1. **ตั้งค่า API Key:**
   - ไปที่เมนู Settings (ไอคอนฟันเฟือง)
   - ใส่ Gemini API Key จาก [Google AI Studio](https://aistudio.google.com/app/apikey)

2. **บันทึกการทำนาย:**
   - อัปโหลดภาพกราฟเทคนิค
   - ระบุชื่อหุ้นและเหตุผลในการทำนาย
   - AI จะช่วยวิเคราะห์และให้คะแนนความเห็นพ้อง (Alignment Score)

3. **ติดตามผลรายสัปดาห์:**
   - ระบบจะให้คุณอัปเดตราคาหุ้นทุกสัปดาห์เป็นเวลา 4 สัปดาห์
   - AI จะช่วยวิเคราะห์ความคืบหน้าและเปรียบเทียบกับแผนเดิม

## การติดตั้งสำหรับนักพัฒนา (Local Development)

```bash
# ติดตั้ง dependencies
npm install

# รันโหมดพัฒนา
npm run dev
```

## การ Deploy ขึ้น Web Server

แอปพลิเคชันนี้รองรับการ Deploy บน Platform ต่างๆ เช่น:
- **Railway.app**
- **Render.com**
- **DigitalOcean App Platform**

โดยใช้คำสั่ง `npm start` ในการรันเซิร์ฟเวอร์

---
พัฒนาโดย AI Studio - Stock Insight AI Project
