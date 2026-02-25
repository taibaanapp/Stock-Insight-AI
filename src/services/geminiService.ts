import { GoogleGenAI, Type } from "@google/genai";

function getAI() {
  const apiKey = localStorage.getItem('gemini_api_key') || process.env.GEMINI_API_KEY || "";
  return new GoogleGenAI({ apiKey });
}

async function incrementUsage() {
  try {
    await fetch('/api/usage/increment', { method: 'POST' });
  } catch (e) {
    console.error("Failed to increment usage", e);
  }
}

export interface PredictionAnalysis {
  prediction: 'up' | 'down';
  reasoning: string;
  confidence: number;
  initialPrice?: number;
  alignmentScore?: number;
  alignmentReason?: string;
}

export async function analyzeChart(imageData: string, ticker: string, userPrediction?: string, userReasoning?: string): Promise<PredictionAnalysis> {
  await incrementUsage();
  const ai = getAI();
  const model = "gemini-3-flash-preview";
  
  const prompt = `วิเคราะห์กราฟหุ้นของ ${ticker} นี้:
  1. ระบุราคาปัจจุบันหากมองเห็น
  2. ทำนายว่าหุ้นจะขึ้น (UP) หรือลง (DOWN) ในอีก 4 สัปดาห์ข้างหน้า
  3. ให้เหตุผลทางเทคนิคโดยละเอียด (ตอบเป็นภาษาไทย)
  ${userPrediction ? `4. เปรียบเทียบกับคำทำนายของผู้ใช้ (${userPrediction}) และเหตุผลของผู้ใช้ (${userReasoning}) ให้คะแนนความเห็นพ้อง (Alignment Score) 0-100% ว่าคุณเห็นด้วยกับตรรกะของผู้ใช้มากแค่ไหน` : ''}
  5. ส่งคืนผลลัพธ์ในรูปแบบ JSON`;

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: "image/png",
              data: imageData.split(',')[1] // Remove data:image/png;base64,
            }
          }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          prediction: { type: Type.STRING, enum: ['up', 'down'] },
          reasoning: { type: Type.STRING, description: "เหตุผลวิเคราะห์เป็นภาษาไทย" },
          confidence: { type: Type.NUMBER },
          initialPrice: { type: Type.NUMBER },
          alignmentScore: { type: Type.NUMBER, description: "คะแนนความเห็นพ้องกับผู้ใช้ 0-100" },
          alignmentReason: { type: Type.STRING, description: "เหตุผลสั้นๆ ว่าทำไมถึงให้คะแนนความเห็นพ้องเท่านี้" }
        },
        required: ['prediction', 'reasoning', 'confidence']
      }
    }
  });

  return JSON.parse(response.text || "{}");
}

export async function getLatestPrice(ticker: string): Promise<number> {
  await incrementUsage();
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `What is the current stock price of ${ticker}? Return only the number.`,
    config: {
      tools: [{ googleSearch: {} }]
    }
  });
  
  const price = parseFloat(response.text?.match(/\d+\.?\d*/)?.[0] || "0");
  return price;
}

export async function performWeeklyAnalysis(
  ticker: string,
  initialPrice: number,
  currentPrice: number,
  userPrediction: string,
  userReasoning: string,
  geminiPrediction: string,
  geminiReasoning: string,
  week: number,
  targetPrice?: number
) {
  await incrementUsage();
  const ai = getAI();
  const prompt = `
    หุ้น: ${ticker}
    ราคาเริ่มต้น: ${initialPrice}
    ราคาเป้าหมายของผู้ใช้: ${targetPrice || 'ไม่ได้ระบุ'}
    ราคาปัจจุบัน (สัปดาห์ที่ ${week}): ${currentPrice}
    คำทำนายของผู้ใช้: ${userPrediction} (${userReasoning})
    คำทำนายของ Gemini: ${geminiPrediction} (${geminiReasoning})

    วิเคราะห์การเคลื่อนไหวของราคา:
    1. ใครแม่นยำกว่ากันในขณะนี้?
    2. ราคาเข้าใกล้เป้าหมายของผู้ใช้หรือไม่?
    3. ให้คะแนนความเห็นพ้อง (Alignment Score) 0-100% ว่าตรรกะของ Gemini ในสัปดาห์นี้เห็นพ้องกับตรรกะเริ่มต้นของผู้ใช้มากแค่ไหน
    4. วิเคราะห์สถานะปัจจุบันสั้นๆ (ตอบเป็นภาษาไทย)
    
    ส่งคืนในรูปแบบ JSON ที่มีฟิลด์: analysis (string), alignmentScore (number), alignmentReason (string)
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          analysis: { type: Type.STRING },
          alignmentScore: { type: Type.NUMBER },
          alignmentReason: { type: Type.STRING }
        },
        required: ['analysis', 'alignmentScore', 'alignmentReason']
      }
    }
  });

  return JSON.parse(response.text || "{}");
}

export async function performFinalRetrospective(
  ticker: string,
  userReasoning: string,
  weeklyData: any[]
) {
  await incrementUsage();
  const ai = getAI();
  const prompt = `
    การวิเคราะห์ย้อนหลังสำหรับ ${ticker} หลังจากผ่านไป 4 สัปดาห์
    เหตุผลเริ่มต้นของผู้ใช้: ${userReasoning}
    ข้อมูลรายสัปดาห์: ${JSON.stringify(weeklyData)}

    1. ประเมินเหตุผลเริ่มต้นของผู้ใช้ ว่าส่วนไหนถูกหรือผิด?
    2. แนะนำการปรับปรุงสำหรับการวิเคราะห์ทางเทคนิคของผู้ใช้
    3. ข้อมูลเพิ่มเติมใดที่ผู้ใช้ควรพิจารณา?
    4. ให้คะแนนสุดท้ายสำหรับตรรกะการทำนาย
    (ตอบเป็นภาษาไทยทั้งหมด)
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt
  });

  return response.text;
}
