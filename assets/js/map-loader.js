(function () {
  let loadingPromise = null;

  function showMapConfigurationError() {
    const map = document.getElementById('map');
    if (map) {
      map.innerHTML = '<div class="map-message">地圖服務尚未設定。請提供受限的 Google Maps 瀏覽器金鑰。</div>';
    }
  }

  window.loadGoogleMaps = function (callback) {
    if (window.google && window.google.maps) {
      callback();
      return Promise.resolve();
    }
    if (loadingPromise) return loadingPromise.then(callback);

    const key = window.APP_CONFIG && window.APP_CONFIG.googleMapsApiKey;
    if (!key) {
      showMapConfigurationError();
      return Promise.reject(new Error('Google Maps API key is not configured'));
    }

    loadingPromise = new Promise((resolve, reject) => {
      const callbackName = '__smellLoggerMapsReady';
      window[callbackName] = () => {
        delete window[callbackName];
        resolve();
      };
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&callback=${callbackName}`;
      script.async = true;
      script.defer = true;
      script.onerror = () => reject(new Error('Google Maps failed to load'));
      document.head.appendChild(script);
    });

    return loadingPromise.then(callback).catch(error => {
      showMapConfigurationError();
      console.error('Google Maps loading failed:', error);
      throw error;
    });
  };
})();
