(function () {
  const REPORTER_PROFILE_STORAGE_KEY = 'smelllogger.reporterProfile.v1';
  const FORM_ASSISTANCE_NOTE = '本通報由 https://conlinkang.github.io/smelllogger/index.html 輔助填單。';

  const optionLabels = {
    odorType: {
      chemical: '化學溶劑或油漆味',
      sulfur: '硫磺或臭雞蛋味',
      ammonia: '氨味或尿味',
      sewage: '污水或腐敗味',
      burning: '燃燒或塑膠焦味',
      oil: '油煙或餐飲異味',
      livestock: '畜牧或堆肥異味',
      other: '其他異味'
    },
    moenvCause: {
      animal: '動物',
      biogas: '沼氣（瓦斯）',
      strawBurning: '燃燒稻草',
      incenseBurning: '燃燒行為－燒香或紙錢',
      unknown: '不明',
      other: '其他',
      productionProcess: '生產或作業過程',
      openBurning: '露天燃燒',
      fire: '火災',
      kitchenWaste: '廚餘蒸煮異味',
      cookingSmoke: '烹飪油煙',
      fertilizeCompost: '施肥或堆肥'
    },
    duration: {
      lessThanFive: '5 分鐘內',
      fiveToThirty: '5–30 分鐘',
      thirtyToTwoHours: '30–120 分鐘',
      moreThanTwoHours: '超過 2 小時',
      recurring: '反覆發生'
    },
    source: {
      factory: '工廠或工業設施',
      livestock: '畜牧場或堆肥場',
      sewage: '污水或下水道',
      burning: '露天燃燒或廢棄物燃燒',
      restaurant: '餐飲或油煙',
      vehicle: '車輛或交通活動',
      unknown: '無法判斷'
    },
    impact: {
      none: '目前沒有明顯不適',
      headache: '頭暈或頭痛',
      nausea: '噁心',
      throat: '喉嚨或呼吸道不適',
      eye: '眼睛刺激',
      other: '其他不適'
    }
  };

  function getValue(id) {
    const element = document.getElementById(id);
    return element ? element.value : '';
  }

  function getSelectedLabels(name, labels) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`))
      .filter(input => input.checked !== false)
      .map(input => labels[input.value])
      .filter(Boolean);
  }

  function formatDateTime(value) {
    if (!value) return '目前時間';
    const inputParts = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (inputParts) return `${inputParts[1]}/${inputParts[2]}/${inputParts[3]} ${inputParts[4]}:${inputParts[5]}`;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  }

  function getAddressText() {
    const address = document.getElementById('address');
    const text = address ? address.textContent.trim() : '';
    return text.replace(/^地址:\s*/, '') || 'GPS 定位點附近';
  }

  function parseOfficialLocation(addressText) {
    const value = String(addressText || '').trim();
    const withoutTaiwanPrefix = value
      .replace(/^(?:台灣|臺灣)\s*[,，、]?\s*/, '')
      .replace(/^[,，、\s]+/, '');
    const yunlinIndex = withoutTaiwanPrefix.indexOf('雲林縣');
    const normalized = yunlinIndex >= 0 ? withoutTaiwanPrefix.slice(yunlinIndex) : withoutTaiwanPrefix;
    const countyMatch = normalized.match(/^([\u4e00-\u9fff]{2,4}(?:縣|市))/);
    const county = countyMatch ? countyMatch[1] : '';
    const remainder = county ? normalized.slice(county.length).replace(/^[,，、\s]+/, '') : '';
    const townMatch = remainder.match(/^([\u4e00-\u9fff]{1,6}(?:市|鎮|鄉|區))/);
    return {
      county,
      town: townMatch ? townMatch[1] : '',
      addressNote: value
    };
  }

  function getSmellLevelText() {
    const selected = document.querySelector('input[name="smellLevel"]:checked');
    return selected ? `${selected.value} 級` : '未選擇';
  }

  function getWeatherInfo(elementId) {
    if (typeof window.readWeatherInfo !== 'function') {
      return { weather: '', temperature: null, windSpeed: null, windDirection: null, provider: '' };
    }
    return window.readWeatherInfo(elementId);
  }

  function getReporterData() {
    const reporter = {
      name: getValue('reporterName').trim(),
      phone: getValue('reporterPhone').trim(),
      email: getValue('reporterEmail').trim(),
      address: getValue('reporterAddress').trim()
    };
    const hasReporterData = Object.values(reporter).some(value => value !== '');
    return {
      reporter,
      reporterConsent: Boolean(document.getElementById('reporterConsent') && document.getElementById('reporterConsent').checked),
      reporterSource: hasReporterData
        ? (document.getElementById('reporterConsent') && document.getElementById('reporterConsent').checked ? 'user-local' : 'user-session')
        : 'platform-only'
    };
  }

  function reporterFields() {
    return ['reporterName', 'reporterPhone', 'reporterEmail', 'reporterAddress'];
  }

  function readReporterProfile() {
    const profile = {};
    reporterFields().forEach(id => { profile[id] = getValue(id).trim(); });
    return profile;
  }

  function hasCompleteReporterProfile(profile) {
    return reporterFields().every(id => String(profile[id] || '').trim() !== '');
  }

  function setReporterProfileStatus(message) {
    const status = document.getElementById('reporterProfileStatus');
    if (status) status.textContent = message || '';
  }

  function loadReporterProfile() {
    try {
      const raw = window.localStorage && window.localStorage.getItem(REPORTER_PROFILE_STORAGE_KEY);
      if (!raw) return false;
      const profile = JSON.parse(raw);
      if (!profile || !hasCompleteReporterProfile(profile)) return false;
      reporterFields().forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = profile[id];
      });
      const consent = document.getElementById('reporterConsent');
      if (consent) consent.checked = true;
      setReporterProfileStatus('已從本機帶入；平台不會收到或保存這些個資。');
      return true;
    } catch (error) {
      setReporterProfileStatus('本機個資讀取失敗，請重新填寫。');
      return false;
    }
  }

  function saveReporterProfile() {
    const profile = readReporterProfile();
    if (!hasCompleteReporterProfile(profile)) {
      setReporterProfileStatus('四項資料填寫完整後，才會記住於本機。');
      return false;
    }
    try {
      window.localStorage.setItem(REPORTER_PROFILE_STORAGE_KEY, JSON.stringify(profile));
      setReporterProfileStatus('已記住於本機；平台不會收到或保存這些個資。');
      return true;
    } catch (error) {
      setReporterProfileStatus('本機儲存失敗；本次仍可使用，但下次不會自動帶入。');
      return false;
    }
  }

  function clearReporterProfile() {
    try { window.localStorage.removeItem(REPORTER_PROFILE_STORAGE_KEY); } catch (error) { /* Ignore unavailable storage. */ }
    reporterFields().forEach(id => {
      const input = document.getElementById(id);
      if (input) input.value = '';
    });
    const consent = document.getElementById('reporterConsent');
    if (consent) consent.checked = false;
    setReporterProfileStatus('已清除本機填單資料。');
  }

  function getOfficialFormData(complaint) {
    const location = parseOfficialLocation(complaint.locationAddress);
    const reporter = complaint.reporter || {};
    return {
      pollutantName: getValue('pollutantName').trim() || '不明',
      pollutantPhone: getValue('pollutantPhone').trim(),
      pollutantResponsible: getValue('pollutantResponsible').trim(),
      inspectionTime: getValue('inspectionTime') || 'no',
      replyMethod: getValue('replyMethod') || (reporter.email ? 'email' : 'phone'),
      joinInspection: getValue('joinInspection') || 'no',
      pollutionCounty: location.county,
      pollutionTown: location.town,
      pollutionAddressNote: location.addressNote
    };
  }

  function formatWeatherInfo(weatherInfo, prefix = '系統取得的現場氣象') {
    if (!weatherInfo) return '';
    const parts = [];
    if (weatherInfo.weather && weatherInfo.weather !== '未取得') parts.push(weatherInfo.weather);
    if (Number.isFinite(weatherInfo.temperature)) parts.push(`溫度 ${weatherInfo.temperature}°C`);
    if (Number.isFinite(weatherInfo.windSpeed)) parts.push(`風速 ${weatherInfo.windSpeed} m/s`);
    if (Number.isFinite(weatherInfo.windDirection)) parts.push(`風向 ${weatherInfo.windDirection}°`);
    if (!parts.length) return '';
    const provider = weatherInfo.provider ? `（來源：${weatherInfo.provider}）` : '';
    return `${prefix}：${parts.join('、')}${provider}。`;
  }

  function formatWeatherPacket(weatherInfo) {
    return formatWeatherInfo(weatherInfo, '').replace(/^：/, '') || '尚未取得';
  }

  function generateDescription() {
    const odorType = optionLabels.odorType[getValue('odorType')] || '異味';
    const moenvCause = optionLabels.moenvCause[getValue('moenvCause')];
    const duration = optionLabels.duration[getValue('odorDuration')] || '時間未填寫';
    const source = optionLabels.source[getValue('suspectedSource')];
    const impacts = getSelectedLabels('odorImpact', optionLabels.impact);
    const detail = getValue('odorDetail').trim();
    const time = formatDateTime(getValue('smellTime'));
    const address = getAddressText();
    const weatherLine = formatWeatherInfo(getWeatherInfo('weatherInfo'));

    const sentences = [
      `於 ${time}，在${address}聞到${odorType}，臭味程度為${getSmellLevelText()}，持續約${duration}。`
    ];

    if (moenvCause) sentences.push(`環境部快速分類為「${moenvCause}」。`);
    if (weatherLine) sentences.push(weatherLine);
    if (source && source !== optionLabels.source.unknown) {
      sentences.push(`現場觀察疑似與${source}有關，僅供查核參考。`);
    }
    if (impacts.length > 0 && !impacts.includes(optionLabels.impact.none)) {
      sentences.push(`當時感受：${impacts.join('、')}。`);
    }
    if (detail) sentences.push(`補充說明：${detail}`);
    sentences.push(FORM_ASSISTANCE_NOTE);

    const description = document.getElementById('reportDescription');
    if (description) {
      description.value = sentences.join('');
      description.dataset.userEdited = 'false';
    }
    return description ? description.value : sentences.join('');
  }

  function getComplaintData() {
    const description = document.getElementById('reportDescription');
    const reporterData = getReporterData();
    const complaint = {
      pollutionCategory: '異味污染物',
      locationAddress: getAddressText(),
      moenvCause: getValue('moenvCause'),
      moenvCauseLabel: optionLabels.moenvCause[getValue('moenvCause')] || '',
      odorType: getValue('odorType'),
      odorTypeLabel: optionLabels.odorType[getValue('odorType')] || '',
      duration: getValue('odorDuration'),
      durationLabel: optionLabels.duration[getValue('odorDuration')] || '',
      suspectedSource: getValue('suspectedSource'),
      suspectedSourceLabel: optionLabels.source[getValue('suspectedSource')] || '',
      impacts: Array.from(document.querySelectorAll('input[name="odorImpact"]:checked'))
        .filter(input => input.checked !== false)
        .map(input => input.value),
      impactLabels: getSelectedLabels('odorImpact', optionLabels.impact),
      description: description ? description.value.trim() : '',
      officialSubmissionConfirmed: Boolean(document.getElementById('officialSubmissionConfirmed') && document.getElementById('officialSubmissionConfirmed').checked),
      reporterConsent: reporterData.reporterConsent,
      reporterSource: reporterData.reporterSource,
      reporter: reporterData.reporter
    };
    complaint.officialForm = getOfficialFormData(complaint);
    return complaint;
  }

  function getPlatformComplaintData() {
    const complaint = getComplaintData();
    delete complaint.reporter;
    delete complaint.reporterConsent;
    delete complaint.reporterSource;
    return complaint;
  }

  function getOfficialSubmissionPacket() {
    const complaint = getComplaintData();
    const config = window.APP_CONFIG || {};
    const finalMode = config.officialSubmissionMode === 'submit';
    const finalConfirmed = finalMode && complaint.officialSubmissionConfirmed;
    return {
      mode: finalMode ? 'submit' : 'prepare',
      finalSubmit: finalConfirmed,
      confirmationText: finalConfirmed ? (config.officialFinalConfirmationText || '') : '',
      officialSubmissionConfirmed: complaint.officialSubmissionConfirmed,
      reporter: complaint.reporter,
      complaint: {
        locationAddress: complaint.locationAddress,
        description: complaint.description,
        moenvCause: complaint.moenvCause,
        moenvCauseLabel: complaint.moenvCauseLabel,
        officialForm: complaint.officialForm
      }
    };
  }

  function getReportPacketText() {
    const complaint = getComplaintData();
    const weatherInfo = getWeatherInfo('weatherInfo');
    const suspectedWeatherInfo = getWeatherInfo('weatherInfo_suspect');
    const lines = [
      '公害污染陳情資料（異味污染物）',
      `發生時間：${formatDateTime(getValue('smellTime'))}`,
      `地點：${complaint.locationAddress || 'GPS 定位點'}`,
      `環境部快速分類：${complaint.moenvCauseLabel || '未選擇'}`,
      `污染者名稱：${complaint.officialForm.pollutantName}`,
      `污染地點縣市：${complaint.officialForm.pollutionCounty || '未判定'}${complaint.officialForm.pollutionTown || ''}`,
      `官方回覆方式：${complaint.officialForm.replyMethod === 'email' ? 'Email回覆' : complaint.officialForm.replyMethod === 'phone' ? '電話回覆' : '書面回覆'}`,
      `臭味程度：${getSmellLevelText()}`,
      `發生地點氣象：${formatWeatherPacket(weatherInfo)}`,
      `疑似位置氣象：${formatWeatherPacket(suspectedWeatherInfo)}`,
      `異味類型：${complaint.odorTypeLabel || '未選擇'}`,
      `持續時間：${complaint.durationLabel || '未填寫'}`,
      `疑似來源：${complaint.suspectedSourceLabel || '無法判斷'}（僅供查核參考）`,
      `身體感受：${complaint.impactLabels.length ? complaint.impactLabels.join('、') : '未填寫'}`,
      `通報說明：${complaint.description || '未填寫'}`,
      `填單備註：${FORM_ASSISTANCE_NOTE}`,
      `通報人姓名：${complaint.reporter.name || '未填寫'}`,
      `電話：${complaint.reporter.phone || '未填寫'}`,
      `電子信箱：${complaint.reporter.email || '未填寫'}`,
      `聯絡地址：${complaint.reporter.address || '未填寫'}`
    ];
    return lines.join('\n');
  }

  function hasUnconsentedReporterData(complaint) {
    if (!complaint || !complaint.reporter) return false;
    const hasReporterData = Object.values(complaint.reporter).some(value => String(value || '').trim() !== '');
    const hasCompleteData = Object.values(complaint.reporter).every(value => String(value || '').trim() !== '');
    return hasReporterData && !hasCompleteData;
  }

  function refreshDescriptionIfPristine() {
    const description = document.getElementById('reportDescription');
    if (description && description.dataset.userEdited !== 'true') generateDescription();
  }

  function setupReportForm() {
    const description = document.getElementById('reportDescription');
    const generateButton = document.getElementById('generateDescription');
    if (!description || !generateButton) return;
    const copyButton = document.getElementById('copyReportDescription');
    const packetButton = document.getElementById('copyReportPacket');
    const reporterConsent = document.getElementById('reporterConsent');
    const clearReporterButton = document.getElementById('clearReporterProfile');

    loadReporterProfile();

    description.addEventListener('input', () => {
      description.dataset.userEdited = 'true';
    });
    generateButton.addEventListener('click', generateDescription);
    if (copyButton) {
      copyButton.addEventListener('click', async () => {
        const text = description.value.trim();
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          copyButton.textContent = '已複製';
          setTimeout(() => { copyButton.textContent = '複製通報說明'; }, 1600);
        } catch (error) {
          description.focus();
          description.select();
          copyButton.textContent = '請按 Ctrl+C 複製';
        }
      });
    }
    if (packetButton) {
      packetButton.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(getReportPacketText());
          packetButton.textContent = '完整資料已複製';
          setTimeout(() => { packetButton.textContent = '複製完整通報資料'; }, 1600);
        } catch (error) {
          packetButton.textContent = '請在 HTTPS 網頁複製';
          setTimeout(() => { packetButton.textContent = '複製完整通報資料'; }, 1600);
        }
      });
    }

    ['odorType', 'moenvCause', 'odorDuration', 'suspectedSource', 'smellTime', 'officialSubmissionConfirmed'].forEach(id => {
      const element = document.getElementById(id);
      if (element) element.addEventListener('change', () => {
        if (description.dataset.userEdited !== 'true') generateDescription();
      });
    });
    document.querySelectorAll('input[name="odorImpact"]').forEach(input => {
      input.addEventListener('change', () => {
        if (input.value === 'none' && input.checked) {
          document.querySelectorAll('input[name="odorImpact"]').forEach(other => {
            if (other !== input) other.checked = false;
          });
        } else if (input.value !== 'none' && input.checked) {
          const none = document.querySelector('input[name="odorImpact"][value="none"]');
          if (none) none.checked = false;
        }
        if (description.dataset.userEdited !== 'true') generateDescription();
      });
    });
    document.querySelectorAll('input[name="smellLevel"]').forEach(input => {
      input.addEventListener('change', () => {
        if (description.dataset.userEdited !== 'true') generateDescription();
      });
    });
    reporterFields().forEach(id => {
      const input = document.getElementById(id);
      if (input) input.addEventListener('input', () => {
        if (reporterConsent && reporterConsent.checked) saveReporterProfile();
      });
    });
    if (reporterConsent) {
      reporterConsent.addEventListener('change', () => {
        if (reporterConsent.checked) saveReporterProfile();
        else setReporterProfileStatus('未記住於本機；本次填寫仍可使用。');
      });
    }
    if (clearReporterButton) clearReporterButton.addEventListener('click', clearReporterProfile);
    const detail = document.getElementById('odorDetail');
    if (detail) detail.addEventListener('input', refreshDescriptionIfPristine);
  }

  window.generateReportDescription = generateDescription;
  window.getReportPacketText = getReportPacketText;
  window.hasUnconsentedReporterData = hasUnconsentedReporterData;
  window.clearReporterProfile = clearReporterProfile;
  window.refreshReportDescriptionIfPristine = refreshDescriptionIfPristine;
  window.getComplaintData = getComplaintData;
  window.getPlatformComplaintData = getPlatformComplaintData;
  window.getOfficialSubmissionPacket = getOfficialSubmissionPacket;
  window.addEventListener('DOMContentLoaded', setupReportForm);
})();
