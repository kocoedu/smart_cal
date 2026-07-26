export default async function handler(req, res) {
  // POST 요청 여부 확인
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // 서버 환경변수에서 GEMINI_API_KEY 읽기
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY 환경변수가 Vercel 서버에 설정되지 않았습니다. Vercel 대시보드의 Project Settings > Environment Variables 메뉴에서 GEMINI_API_KEY를 설정 후 다시 배포해주세요.'
    });
  }

  try {
    const { imageBase64, mimeType } = req.body || {};

    if (!imageBase64 || !mimeType) {
      return res.status(400).json({ error: '분석할 이미지 데이터가 누락되었습니다.' });
    }

    // 학교 영양사 페르소나 및 JSON 응답 요구 프롬프트
    const promptText = `당신은 학교 영양사입니다.

사진 속 음식을 분석하세요.

반드시 아래 JSON 형식으로만 답변하세요.

설명은 절대로 하지 마세요.

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

- 음식 이름은 가능한 정확하게 작성
- 칼로리 및 영양소는 AI 추정값
- 건강점수는 1~5점
- comment는 학생이 이해하기 쉬운 건강 조언`;

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

    const payload = {
      contents: [
        {
          parts: [
            { text: promptText },
            {
              inlineData: {
                mimeType: mimeType,
                data: imageBase64
              }
            }
          ]
        }
      ]
    };

    // 쓰로틀링 대비 지수 백오프 기반 재시도 알고리즘
    let attempts = 0;
    let response = null;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (response.ok) break;
      } catch (e) {
        console.warn(`Gemini API 통신 시도 중... (${attempts + 1}/${maxAttempts})`);
      }
      attempts++;
      if (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, attempts * 1000));
      }
    }

    if (!response || !response.ok) {
      const errDetail = response ? await response.text() : '네트워크 통신 오류';
      return res.status(response ? response.status : 500).json({
        error: `Gemini API 분석 실패: ${errDetail}`
      });
    }

    const resultData = await response.json();
    const textOutput = resultData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textOutput) {
      return res.status(500).json({ error: 'Gemini API 결과 응답에서 데이터 텍스트를 추출하지 못했습니다.' });
    }

    // 클라이언트로 분석 결과 전달
    return res.status(200).json({ text: textOutput });

  } catch (error) {
    console.error('Serverless Function Error:', error);
    return res.status(500).json({ error: error.message || '서버 내부 예외가 발생했습니다.' });
  }
}