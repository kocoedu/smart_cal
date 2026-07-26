export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Vercel 환경 변수에서 GEMINI_API_KEY 읽기
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ 
                error: '서버 환경 변수에 GEMINI_API_KEY가 설정되어 있지 않습니다. Vercel 설정에서 GEMINI_API_KEY를 추가해주세요.' 
            });
        }

        const { base64ImageData, mimeType } = req.body;
        if (!base64ImageData || !mimeType) {
            return res.status(400).json({ error: '유효한 이미지 데이터가 전달되지 않았습니다.' });
        }

        const dietitianPrompt = `당신은 학교 영양사입니다. 
사진 속 음식을 분석하세요. 
반드시 아래 JSON 형식으로만 답변하세요.
설명은 절대 하지 마세요.

{
  "foods":[
    {
      "name":"",
      "estimated_calorie":"",
      "protein":"",
      "carbohydrate":"",
      "fat":""
    }
  ],
  "total_calorie":"",
  "health_score":"",
  "comment":""
}

조건
- 음식 이름은 최대한 정확하게 작성
- 칼로리와 영양소는 AI 추정값 (숫자만 입력 ex: 120, g 단위 생략)
- 건강점수는 1~5점 숫자만 입력
- comment는 학생 눈높이의 다정하고 유익한 건강 식생활 조언 작성`;

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

        const payload = {
            contents: [
                {
                    parts: [
                        { text: dietitianPrompt },
                        {
                            inlineData: {
                                mimeType: mimeType,
                                data: base64ImageData
                            }
                        }
                    ]
                }
            ],
            generationConfig: {
                responseMimeType: "application/json"
            }
        };

        // Gemini Vision API 호출
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errDetails = await response.json().catch(() => ({}));
            return res.status(response.status).json({ 
                error: errDetails?.error?.message || `Gemini API 호출에 실패했습니다. (HTTP ${response.status})` 
            });
        }

        const resultJson = await response.json();
        const rawText = resultJson?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!rawText) {
            return res.status(500).json({ error: 'AI 분석 결과 데이터를 추출하지 못했습니다.' });
        }

        const parsedData = JSON.parse(rawText.trim());
        return res.status(200).json(parsedData);

    } catch (error) {
        console.error('Serverless Function Error:', error);
        return res.status(500).json({ error: error.message || '서버 분석 처리 중 오류가 발생했습니다.' });
    }
}