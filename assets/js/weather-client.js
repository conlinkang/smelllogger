(function () {
  function getConfig() {
    return window.APP_CONFIG || {};
  }

  function asNumber(value) {
    return Number.isFinite(Number(value)) ? Number(value) : null;
  }

  function describeOpenMeteoWeather(code) {
    const weatherCode = Number(code);
    const labels = new Map([
      [0, '晴天'],
      [1, '大致晴朗'],
      [2, '多雲'],
      [3, '陰天'],
      [45, '有霧'],
      [48, '霧凇'],
      [51, '毛毛雨'],
      [53, '毛毛雨'],
      [55, '較強毛毛雨'],
      [56, '凍毛毛雨'],
      [57, '較強凍毛毛雨'],
      [61, '小雨'],
      [63, '中雨'],
      [65, '大雨'],
      [66, '凍雨'],
      [67, '較強凍雨'],
      [71, '小雪'],
      [73, '中雪'],
      [75, '大雪'],
      [77, '雪粒'],
      [80, '短暫陣雨'],
      [81, '陣雨'],
      [82, '強陣雨'],
      [85, '短暫陣雪'],
      [86, '強陣雪'],
      [95, '雷雨'],
      [96, '雷雨伴隨冰雹'],
      [99, '強雷雨伴隨冰雹']
    ]);
    return labels.get(weatherCode) || '天氣型態未取得';
  }

  async function fetchOpenWeather(latitude, longitude, config) {
    const params = new URLSearchParams({
      lat: String(latitude),
      lon: String(longitude),
      appid: String(config.weatherApiKey),
      units: 'metric',
      lang: 'zh_tw'
    });
    const response = await fetch(`${config.weatherEndpoint}?${params.toString()}`);
    if (!response.ok) throw new Error(`OpenWeatherMap request failed: ${response.status}`);
    const data = await response.json();
    const weather = data.weather && data.weather[0] ? data.weather[0].description : '';
    return {
      weather,
      temperature: asNumber(data.main && data.main.temp),
      windSpeed: asNumber(data.wind && data.wind.speed),
      windDirection: asNumber(data.wind && data.wind.deg),
      provider: 'OpenWeatherMap'
    };
  }

  async function fetchOpenMeteo(latitude, longitude, config) {
    const endpoint = config.weatherFallbackEndpoint || 'https://api.open-meteo.com/v1/forecast';
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: 'temperature_2m,wind_speed_10m,wind_direction_10m,weather_code',
      wind_speed_unit: 'ms',
      timezone: 'Asia/Taipei'
    });
    const response = await fetch(`${endpoint}?${params.toString()}`);
    if (!response.ok) throw new Error(`Open-Meteo request failed: ${response.status}`);
    const data = await response.json();
    const current = data.current || {};
    return {
      weather: describeOpenMeteoWeather(current.weather_code),
      temperature: asNumber(current.temperature_2m),
      windSpeed: asNumber(current.wind_speed_10m),
      windDirection: asNumber(current.wind_direction_10m),
      provider: 'Open-Meteo'
    };
  }

  window.fetchCurrentWeather = async function (latitude, longitude) {
    const config = getConfig();
    if (config.weatherProvider === 'openweathermap' && config.weatherApiKey && config.weatherEndpoint) {
      try {
        return await fetchOpenWeather(latitude, longitude, config);
      } catch (error) {
        console.warn('OpenWeatherMap unavailable; using Open-Meteo fallback.', error);
      }
    }
    return fetchOpenMeteo(latitude, longitude, config);
  };

  window.renderWeatherInfo = function (elementId, weather) {
    const container = document.getElementById(elementId);
    if (!container) return;
    const valueOrFallback = (value, suffix = '') => Number.isFinite(value) ? `${value}${suffix}` : '未取得';
    container.querySelector('.weather-description').textContent = `天氣：${weather.weather || '未取得'}`;
    container.querySelector('.temperature').textContent = `溫度：${valueOrFallback(weather.temperature, '°C')}`;
    container.querySelector('.wind-speed').textContent = `風速：${valueOrFallback(weather.windSpeed, ' m/s')}`;
    container.querySelector('.wind-direction').textContent = `風向：${valueOrFallback(weather.windDirection, '°')}`;
    container.dataset.provider = weather.provider || '';
  };

  window.readWeatherInfo = function (elementId) {
    const container = document.getElementById(elementId);
    if (!container) return { weather: '', temperature: null, windSpeed: null, windDirection: null, provider: '' };
    const readNumber = selector => {
      const element = container.querySelector(selector);
      const text = element ? element.textContent : '';
      const match = text.match(/-?\d+(?:\.\d+)?/);
      return match ? Number(match[0]) : null;
    };
    return {
      weather: container.querySelector('.weather-description').textContent.replace(/^天氣：\s*/, ''),
      temperature: readNumber('.temperature'),
      windSpeed: readNumber('.wind-speed'),
      windDirection: readNumber('.wind-direction'),
      provider: container.dataset.provider || ''
    };
  };
})();
