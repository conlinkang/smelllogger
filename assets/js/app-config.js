// Public runtime configuration. Do not commit private API keys here.
window.APP_CONFIG = Object.freeze({
  // Use a Google Maps browser key restricted by HTTP referrers and API scope.
  googleMapsApiKey: 'AIzaSyDanmWlmu2ecmlLrHzoBtX_lGlJjr8rIWI',
  recordEndpoint: 'https://script.google.com/macros/s/AKfycbxOgCXGmBCrAzEDxld8DQtK7s1yO7f4q5owC-B5pGMiJ-uRN2HY4sZZPvMwScgnlP8/exec',
  recordMode: 'no-cors',
  analysisEndpoint: 'https://script.google.com/macros/s/AKfycbxOgCXGmBCrAzEDxld8DQtK7s1yO7f4q5owC-B5pGMiJ-uRN2HY4sZZPvMwScgnlP8/exec',
  // Cloud Run endpoint. Formal submission still requires the in-page confirmation checkbox.
  officialSubmissionEndpoint: 'https://smelllogger-runner-442879625893.asia-east1.run.app/submit',
  officialSubmissionMode: 'submit',
  officialFinalConfirmationText: '我確認以本人資料正式陳情',
  officialSubmissionTimeoutMs: 60000,
  // Cloud Run voice endpoint. Audio is sent only after the user starts recording.
  voiceAnalysisEndpoint: 'https://smelllogger-runner-442879625893.asia-east1.run.app/analyze-voice',
  voiceMaxSeconds: 15,
  // Optional OpenWeatherMap key. If empty, weather-client.js uses Open-Meteo.
  weatherProvider: 'openweathermap',
  weatherApiKey: '',
  weatherEndpoint: 'https://api.openweathermap.org/data/2.5/weather',
  weatherFallbackEndpoint: 'https://api.open-meteo.com/v1/forecast',
  requestTimeoutMs: 15000
});
